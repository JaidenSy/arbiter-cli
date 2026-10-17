import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConfig, resolveApiUrl, setConfig } from '../src/lib/config.js'
import { DEFAULT_API_URL } from '../src/lib/constants.js'

let home: string

function writeConfigFile(data: object): void {
  const dir = path.join(home, '.config', 'arbiter')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(data))
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'arbiter-cli-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(home)
  vi.stubEnv('ARBITER_API_URL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(home, { recursive: true, force: true })
})

describe('resolveApiUrl precedence', () => {
  it('falls back to the default when there is no env var and no config file', () => {
    expect(resolveApiUrl()).toBe(DEFAULT_API_URL)
    expect(DEFAULT_API_URL).toBe('https://api.arbiterai.dev')
  })

  it('uses the config file over the default', () => {
    writeConfigFile({ access_token: 't', org_id: 'o', api_url: 'https://file.example' })
    expect(resolveApiUrl()).toBe('https://file.example')
  })

  it('uses the env var over the config file', () => {
    writeConfigFile({ access_token: 't', org_id: 'o', api_url: 'https://file.example' })
    vi.stubEnv('ARBITER_API_URL', 'http://localhost:8000')
    expect(resolveApiUrl()).toBe('http://localhost:8000')
  })

  it('strips trailing slashes', () => {
    vi.stubEnv('ARBITER_API_URL', 'http://localhost:8000//')
    expect(resolveApiUrl()).toBe('http://localhost:8000')
  })

  it('ignores a corrupt config file', () => {
    const dir = path.join(home, '.config', 'arbiter')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'config.json'), '{not json')
    expect(getConfig()).toBeNull()
    expect(resolveApiUrl()).toBe(DEFAULT_API_URL)
  })
})

describe('setConfig', () => {
  it('does not persist the built-in default URL', () => {
    setConfig({ access_token: 'tok', org_id: 'org' })
    expect(getConfig()).toEqual({ access_token: 'tok', org_id: 'org' })
  })

  it('persists an explicit env override on first write', () => {
    vi.stubEnv('ARBITER_API_URL', 'http://localhost:8000')
    setConfig({ access_token: 'tok', org_id: 'org' })
    expect(getConfig()?.api_url).toBe('http://localhost:8000')
  })

  it('merges into an existing file and keeps its api_url', () => {
    writeConfigFile({ access_token: 'old', org_id: 'org', api_url: 'https://file.example' })
    vi.stubEnv('ARBITER_API_URL', 'http://other.example')
    setConfig({ access_token: 'new', user_email: 'a@b.c' })
    expect(getConfig()).toEqual({
      access_token: 'new',
      org_id: 'org',
      api_url: 'https://file.example',
      user_email: 'a@b.c',
    })
  })

  it.skipIf(process.platform === 'win32')('writes the file with mode 0600', () => {
    setConfig({ access_token: 'tok', org_id: 'org' })
    const mode = fs.statSync(path.join(home, '.config', 'arbiter', 'config.json')).mode & 0o777
    expect(mode).toBe(0o600)
  })
})
