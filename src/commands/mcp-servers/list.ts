import { Command } from 'commander'
import { get, ApiError } from '../../lib/api.js'
import { requireAuth } from '../../lib/config.js'
import { printTable, printError } from '../../lib/output.js'
import type { MCPServerPage } from '../../types/index.js'

export function registerMcpServersList(mcpServersCmd: Command): void {
  mcpServersCmd
    .command('list')
    .description('List registered MCP servers')
    .option('--json', 'Output raw JSON')
    .action(async (opts: { json?: boolean }) => {
      requireAuth()

      let page: MCPServerPage
      try {
        page = await get<MCPServerPage>('/api/v1/mcp-servers', { skip: 0, limit: 200 })
      } catch (err) {
        if (err instanceof ApiError) {
          printError(`API error: ${err.detail}`)
        }
        throw err
      }

      if (opts.json) {
        console.log(JSON.stringify(page, null, 2))
        return
      }

      if (page.items.length === 0) {
        printTable(['Name', 'Base URL', 'Cache', 'Active'], [])
        console.log('No MCP servers registered.')
        return
      }

      const rows = page.items.map((s) => [
        s.name,
        s.base_url,
        s.cache_enabled ? 'yes' : 'no',
        s.is_active ? 'yes' : 'no',
      ])

      printTable(['Name', 'Base URL', 'Cache', 'Active'], rows)
    })
}
