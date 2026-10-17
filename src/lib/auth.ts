import axios, { type AxiosResponse } from 'axios'
import ora from 'ora'
import open from 'open'
import { resolveApiUrl, setConfig } from './config.js'
import type { DeviceCodeResponse, TokenResponse } from '../types/index.js'

const POLL_INTERVAL_MS = 3000
const MAX_POLL_MS = 15 * 60 * 1000 // 15 minutes
const MAX_NETWORK_ERRORS = 3
const REVOKE_TIMEOUT_MS = 5000

export interface DeviceFlowOptions {
  pollIntervalMs?: number
  maxPollMs?: number
  /** Injected in tests so polling doesn't wait on real timers. */
  sleep?: (ms: number) => Promise<void>
}

export async function deviceFlow(options: DeviceFlowOptions = {}): Promise<TokenResponse> {
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS
  const maxPollMs = options.maxPollMs ?? MAX_POLL_MS
  const wait = options.sleep ?? sleep
  const baseUrl = resolveApiUrl()

  // Step 1: initiate device flow
  const initRes = await axios.post<DeviceCodeResponse>(
    `${baseUrl}/api/v1/auth/cli/device`,
    {},
    { headers: { 'Content-Type': 'application/json' } }
  )
  const { device_code, user_code, verification_uri } = initRes.data

  // Step 2: build the browser URL from the backend-supplied verification_uri
  const verificationUri = `${verification_uri}?code=${user_code}`

  console.log('')
  console.log('  Open your browser to authorize:')
  console.log('')
  console.log(`  ${verificationUri}`)
  console.log('')
  console.log(`  Or visit the URL manually and enter code: ${user_code}`)
  console.log('')

  // Step 3: open browser
  try {
    await open(verificationUri)
  } catch {
    // Browser open is best-effort; user can open manually
  }

  // Step 4: poll for token
  const spinner = ora('Waiting for authorization... (press Ctrl+C to cancel)').start()
  const deadline = Date.now() + maxPollMs
  let networkErrorCount = 0

  while (Date.now() < deadline) {
    await wait(pollIntervalMs)

    // Only the HTTP call is guarded: terminal outcomes below must not be swallowed
    // by the network-error handler.
    let pollRes: AxiosResponse<TokenResponse>
    try {
      pollRes = await axios.post<TokenResponse>(
        `${baseUrl}/api/v1/auth/cli/token`,
        { device_code },
        {
          headers: { 'Content-Type': 'application/json' },
          validateStatus: (s) => [200, 428, 429, 410, 403].includes(s),
        }
      )
    } catch {
      networkErrorCount++
      if (networkErrorCount >= MAX_NETWORK_ERRORS) {
        spinner.fail('Network error.')
        console.error('Could not reach Arbiter API. Check your connection.')
        process.exit(1)
      }
      continue
    }

    networkErrorCount = 0

    if (pollRes.status === 200) {
      spinner.succeed('Authorization granted.')
      const token = pollRes.data
      setConfig({
        access_token: token.access_token,
        org_id: token.org_id,
        logged_in_at: new Date().toISOString(),
      })
      return token
    }

    // 428 = still pending; 429 = polling too fast (backend per-IP limit). Keep waiting.
    if (pollRes.status === 428 || pollRes.status === 429) {
      continue
    }

    // The backend currently reports a rejected code as 410 too ("code_expired_or_rejected").
    if (pollRes.status === 410) {
      spinner.fail('Authorization expired.')
      console.error('Authorization expired or was rejected. Run `arbiter login` again.')
      process.exit(1)
    }

    if (pollRes.status === 403) {
      spinner.fail('Authorization denied.')
      console.error('Authorization denied.')
      process.exit(1)
    }
  }

  spinner.fail('Authorization timed out.')
  console.error('Authorization timed out. Run `arbiter login` to try again.')
  process.exit(1)
}

/**
 * Best-effort server-side revocation via POST /api/v1/auth/logout, which adds the
 * token's jti to the gateway's Redis blocklist. Uses a bare axios call (not the shared
 * client) so a 401 doesn't trigger the client's "session expired" process.exit.
 *
 * Returns true on 2xx, or on 401 (token already invalid, so nothing left to revoke).
 */
export async function revokeSession(accessToken: string, baseUrl = resolveApiUrl()): Promise<boolean> {
  try {
    const res = await axios.post(`${baseUrl}/api/v1/auth/logout`, undefined, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: REVOKE_TIMEOUT_MS,
      validateStatus: () => true,
    })
    return (res.status >= 200 && res.status < 300) || res.status === 401
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
