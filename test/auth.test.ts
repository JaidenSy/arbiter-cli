import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExitCalled, mockProcessExit, silenceConsole } from './helpers.js'

const post = vi.fn()
const setConfig = vi.fn()

vi.mock('axios', () => ({ default: { post: (...args: unknown[]) => post(...args) } }))
vi.mock('open', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('ora', () => ({
  default: () => {
    const spinner = { start: () => spinner, succeed: vi.fn(), fail: vi.fn() }
    return spinner
  },
}))
vi.mock('../src/lib/config.js', () => ({
  resolveApiUrl: () => 'https://api.test',
  setConfig: (...args: unknown[]) => setConfig(...args),
}))

const { deviceFlow, revokeSession } = await import('../src/lib/auth.js')

const DEVICE = {
  status: 200,
  data: {
    device_code: 'dev-123',
    user_code: 'ABCD-EFGH',
    expires_in: 900,
    verification_uri: 'https://arbiterai.dev/cli/verify',
  },
}
const TOKEN = { access_token: 'jwt', token_type: 'bearer', org_id: 'org-1' }
// A real (0ms) macrotask yield: a microtask-only sleep would let a runaway loop starve timers.
const noSleep = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const res = (status: number, data: unknown = {}) => ({ status, data })

beforeEach(() => {
  post.mockReset()
  setConfig.mockReset()
  silenceConsole()
})

describe('deviceFlow polling', () => {
  it('keeps polling on 428/429 and stores the token on 200', async () => {
    post
      .mockResolvedValueOnce(DEVICE)
      .mockResolvedValueOnce(res(428))
      .mockResolvedValueOnce(res(429))
      .mockResolvedValueOnce(res(200, TOKEN))

    await expect(deviceFlow({ sleep: noSleep })).resolves.toEqual(TOKEN)

    expect(post).toHaveBeenCalledTimes(4)
    expect(post.mock.calls[0][0]).toBe('https://api.test/api/v1/auth/cli/device')
    expect(post.mock.calls[1][0]).toBe('https://api.test/api/v1/auth/cli/token')
    expect(post.mock.calls[1][1]).toEqual({ device_code: 'dev-123' })
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: 'jwt', org_id: 'org-1' })
    )
  })

  it.each([
    [410, 'expired'],
    [403, 'denied'],
  ])('exits 1 on %i (%s)', async (status) => {
    const exit = mockProcessExit()
    post
      .mockResolvedValueOnce(DEVICE)
      .mockResolvedValueOnce(res(428))
      .mockResolvedValueOnce(res(status))

    await expect(deviceFlow({ sleep: noSleep })).rejects.toBeInstanceOf(ExitCalled)

    expect(exit).toHaveBeenCalledWith(1)
    expect(post).toHaveBeenCalledTimes(3)
    expect(setConfig).not.toHaveBeenCalled()
  })

  it('gives up after 3 consecutive network errors', async () => {
    const exit = mockProcessExit()
    const netErr = new Error('ECONNREFUSED')
    post
      .mockResolvedValueOnce(DEVICE)
      .mockRejectedValueOnce(netErr)
      .mockRejectedValueOnce(netErr)
      .mockRejectedValueOnce(netErr)

    await expect(deviceFlow({ sleep: noSleep })).rejects.toBeInstanceOf(ExitCalled)
    expect(exit).toHaveBeenCalledWith(1)
    expect(post).toHaveBeenCalledTimes(4)
  })

  it('resets the network error count after a successful poll', async () => {
    const netErr = new Error('ETIMEDOUT')
    post
      .mockResolvedValueOnce(DEVICE)
      .mockRejectedValueOnce(netErr)
      .mockRejectedValueOnce(netErr)
      .mockResolvedValueOnce(res(428))
      .mockRejectedValueOnce(netErr)
      .mockRejectedValueOnce(netErr)
      .mockResolvedValueOnce(res(200, TOKEN))

    await expect(deviceFlow({ sleep: noSleep })).resolves.toEqual(TOKEN)
    expect(post).toHaveBeenCalledTimes(7)
  })

  it('times out once the polling deadline passes', async () => {
    const exit = mockProcessExit()
    post.mockResolvedValueOnce(DEVICE).mockResolvedValue(res(428))

    await expect(deviceFlow({ sleep: noSleep, maxPollMs: 0 })).rejects.toBeInstanceOf(ExitCalled)
    expect(exit).toHaveBeenCalledWith(1)
    expect(post).toHaveBeenCalledTimes(1)
  })
})

describe('revokeSession', () => {
  it.each([
    [204, true],
    [401, true],
    [500, false],
  ])('HTTP %i -> %s', async (status, expected) => {
    post.mockResolvedValueOnce(res(status))
    await expect(revokeSession('jwt', 'https://api.test')).resolves.toBe(expected)
    expect(post).toHaveBeenCalledWith(
      'https://api.test/api/v1/auth/logout',
      undefined,
      expect.objectContaining({ headers: { Authorization: 'Bearer jwt' } })
    )
  })

  it('returns false on a network error', async () => {
    post.mockRejectedValueOnce(new Error('ENOTFOUND'))
    await expect(revokeSession('jwt', 'https://api.test')).resolves.toBe(false)
  })
})
