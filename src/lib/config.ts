import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ArbiterConfig } from '../types/index.js'
import { DEFAULT_API_URL } from './constants.js'

function getConfigDir(): string {
  return path.join(os.homedir(), '.config', 'arbiter')
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json')
}

export function getConfig(): ArbiterConfig | null {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    return JSON.parse(raw) as ArbiterConfig
  } catch {
    return null
  }
}

export function setConfig(data: Partial<ArbiterConfig>): void {
  const dir = getConfigDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const existing: ArbiterConfig = getConfig() ?? { access_token: '', org_id: '' }
  // Persist an explicit override (--api-url / ARBITER_API_URL) on first write so later
  // commands keep talking to the same gateway. The built-in default is deliberately NOT
  // persisted, so a DEFAULT_API_URL change in a new release reaches existing installs.
  const envUrl = process.env['ARBITER_API_URL']
  const seeded: ArbiterConfig =
    existing.api_url || !envUrl ? existing : { ...existing, api_url: envUrl }
  const updated: ArbiterConfig = { ...seeded, ...data }
  const filePath = getConfigPath()
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), { encoding: 'utf-8', mode: 0o600 })
  fs.chmodSync(filePath, 0o600)
}

export function clearConfig(): void {
  const filePath = getConfigPath()
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

export function isLoggedIn(): boolean {
  const cfg = getConfig()
  return !!(cfg?.access_token)
}

export function requireAuth(): ArbiterConfig {
  const cfg = getConfig()
  if (!cfg?.access_token) {
    console.error('Not logged in. Run `arbiter login`.')
    process.exit(1)
  }
  return cfg
}

/**
 * API base URL, without a trailing slash.
 * Precedence: ARBITER_API_URL env (also set by --api-url) > config file > DEFAULT_API_URL.
 */
export function resolveApiUrl(): string {
  const envUrl = process.env['ARBITER_API_URL']
  const url = envUrl || getConfig()?.api_url || DEFAULT_API_URL
  return url.replace(/\/+$/, '')
}
