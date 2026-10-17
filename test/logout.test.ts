import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { silenceConsole } from './helpers.js'

const revokeSession = vi.fn()
const getConfig = vi.fn()
const clearConfig = vi.fn()

vi.mock('../src/lib/auth.js', () => ({
  revokeSession: (...args: unknown[]) => revokeSession(...args),
}))
vi.mock('../src/lib/config.js', () => ({
  getConfig: () => getConfig(),
  clearConfig: () => clearConfig(),
}))

const { registerLogout } = await import('../src/commands/logout.js')

function run() {
  const program = new Command().exitOverride()
  registerLogout(program)
  return program.parseAsync(['node', 'arbiter', 'logout'])
}

let spies: ReturnType<typeof silenceConsole>

beforeEach(() => {
  revokeSession.mockReset()
  getConfig.mockReset()
  clearConfig.mockReset()
  spies = silenceConsole()
})

describe('logout', () => {
  it('revokes the token server-side, then clears local config', async () => {
    getConfig.mockReturnValue({ access_token: 'jwt', org_id: 'o' })
    revokeSession.mockResolvedValue(true)
    await run()
    expect(revokeSession).toHaveBeenCalledWith('jwt')
    expect(clearConfig).toHaveBeenCalled()
    expect(spies.warn).not.toHaveBeenCalled()
  })

  it('still clears local config and warns when revocation fails', async () => {
    getConfig.mockReturnValue({ access_token: 'jwt', org_id: 'o' })
    revokeSession.mockResolvedValue(false)
    await run()
    expect(clearConfig).toHaveBeenCalled()
    expect(spies.warn).toHaveBeenCalled()
  })

  it('does nothing when not logged in', async () => {
    getConfig.mockReturnValue(null)
    await run()
    expect(revokeSession).not.toHaveBeenCalled()
    expect(clearConfig).not.toHaveBeenCalled()
  })
})
