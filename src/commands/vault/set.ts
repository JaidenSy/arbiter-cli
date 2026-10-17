import { Command } from 'commander'
import { post, ApiError } from '../../lib/api.js'
import { requireAuth } from '../../lib/config.js'
import { printSuccess, printError } from '../../lib/output.js'
import { promptSecret, readSecretFromStream } from '../../lib/secret-input.js'
import type { VaultSecretResponse } from '../../types/index.js'

const SECRET_NAME_RE = /^[A-Za-z0-9_]+$/

export function registerVaultSet(vaultCmd: Command): void {
  vaultCmd
    .command('set')
    .description('Store a secret in the vault')
    .option('--agent <id>', 'Agent ID to scope the secret to (omit for org-level secrets)')
    .requiredOption('--key <key>', 'Secret key name (e.g. OPENAI_API_KEY)')
    .option(
      '--value <value>',
      'Secret value (omit to be prompted with masked input — keeps value out of ps aux)'
    )
    .option('--json', 'Output raw JSON')
    .action(
      async (opts: { agent?: string; key: string; value?: string; json?: boolean }) => {
        requireAuth()

        if (!SECRET_NAME_RE.test(opts.key)) {
          printError(
            'Secret key must contain only letters, numbers, and underscores (A-Za-z0-9_).'
          )
        }

        let secretValue: string
        if (opts.value !== undefined) {
          // Explicit --value provided — value appears in process args; accepted trade-off
          // when running from scripts/CI where ps aux visibility is already mitigated.
          secretValue = opts.value
        } else if (process.stdin.isTTY) {
          // Interactive TTY: prompt with masked input so the value never appears in
          // process args, shell history, or terminal scrollback.
          secretValue = await promptSecret(`Secret value for ${opts.key}: `)
        } else {
          // Non-TTY (piped): read from stdin  e.g.  echo $VAL | arbiter vault set ...
          secretValue = await readSecretFromStream(process.stdin)
        }
        if (!secretValue) printError('Secret value cannot be empty.')

        let secret: VaultSecretResponse
        try {
          secret = await post<VaultSecretResponse>('/api/v1/vault/secrets', {
            name: opts.key,
            value: secretValue,
            agent_id: opts.agent ?? null,
          })
        } catch (err) {
          if (err instanceof ApiError) {
            if (err.status === 404) printError('Agent not found.')
            if (err.status === 402)
              printError('Plan limit reached. Upgrade at https://arbiterai.dev/pricing')
            printError(`API error: ${err.detail}`)
          }
          throw err
        }

        if (opts.json) {
          console.log(JSON.stringify(secret, null, 2))
          return
        }

        const scope = opts.agent ? `agent ${opts.agent}` : 'org-level'
        printSuccess(`Secret '${opts.key}' set (${scope}).`)
      }
    )
}
