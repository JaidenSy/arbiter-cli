import { Command } from 'commander'
import { revokeSession } from '../lib/auth.js'
import { clearConfig, getConfig } from '../lib/config.js'
import { printSuccess, printWarning } from '../lib/output.js'

export function registerLogout(program: Command): void {
  program
    .command('logout')
    .description('Revoke your Arbiter session and clear local credentials')
    .action(async () => {
      const cfg = getConfig()
      if (!cfg?.access_token) {
        console.log('Not logged in.')
        return
      }

      // Revoke server-side first (needs the token), then always clear locally.
      const revoked = await revokeSession(cfg.access_token)
      clearConfig()

      if (revoked) {
        printSuccess('Logged out.')
      } else {
        printSuccess('Logged out locally.')
        printWarning(
          'Could not reach the Arbiter API to revoke the token; it stays valid until it expires.'
        )
      }
    })
}
