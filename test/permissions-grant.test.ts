import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExitCalled, mockProcessExit, silenceConsole } from './helpers.js'

const get = vi.fn()
const post = vi.fn()

vi.mock('../src/lib/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api.js')>()
  return {
    ApiError: actual.ApiError,
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  }
})
vi.mock('../src/lib/config.js', () => ({
  requireAuth: () => ({ access_token: 'jwt', org_id: 'org-1' }),
}))

const { ApiError } = await import('../src/lib/api.js')
const { registerPermissionsGrant } = await import('../src/commands/permissions/grant.js')

const SERVERS = { items: [{ id: 'srv-uuid', name: 'filesystem' }], total: 1, skip: 0, limit: 200 }
const GRANT_ARGS = ['--agent', 'agent-1', '--server', 'FileSystem', '--tool', 'read_file']

function run(...args: string[]) {
  const program = new Command().exitOverride()
  registerPermissionsGrant(program.command('permissions'))
  return program.parseAsync(['node', 'arbiter', 'permissions', 'grant', ...args])
}

let consoleSpies: ReturnType<typeof silenceConsole>

beforeEach(() => {
  get.mockReset().mockResolvedValue(SERVERS)
  post.mockReset()
  consoleSpies = silenceConsole()
})

describe('permissions grant', () => {
  it('resolves the server name (case-insensitively) to its id and posts the grant', async () => {
    post.mockResolvedValueOnce({ id: 'perm-1' })
    await run(...GRANT_ARGS)
    expect(post).toHaveBeenCalledWith('/api/v1/agents/agent-1/permissions', {
      mcp_server_id: 'srv-uuid',
      tool_name: 'read_file',
    })
  })

  it('treats 409 Conflict as success (exit 0, idempotent)', async () => {
    const exit = mockProcessExit()
    post.mockRejectedValueOnce(new ApiError(409, 'Permission already exists'))

    await expect(run(...GRANT_ARGS)).rejects.toBeInstanceOf(ExitCalled)

    expect(exit).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(0)
    expect(consoleSpies.log).toHaveBeenCalledWith('Permission already exists.')
  })

  it('exits 1 on other API errors', async () => {
    const exit = mockProcessExit()
    post.mockRejectedValueOnce(new ApiError(404, 'not found'))
    await expect(run(...GRANT_ARGS)).rejects.toBeInstanceOf(ExitCalled)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('exits 1 without posting when the server name is unknown', async () => {
    const exit = mockProcessExit()
    await expect(
      run('--agent', 'agent-1', '--server', 'nope', '--tool', 'read_file')
    ).rejects.toBeInstanceOf(ExitCalled)
    expect(exit).toHaveBeenCalledWith(1)
    expect(post).not.toHaveBeenCalled()
  })
})
