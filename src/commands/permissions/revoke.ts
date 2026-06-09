import { Command } from 'commander'
import { get, del, ApiError } from '../../lib/api.js'
import { requireAuth } from '../../lib/config.js'
import { printSuccess, printError } from '../../lib/output.js'
import type { MCPServerPage, PermissionPage } from '../../types/index.js'

export function registerPermissionsRevoke(permissionsCmd: Command): void {
  permissionsCmd
    .command('revoke')
    .description('Revoke a tool permission from an agent')
    .requiredOption('--agent <id>', 'Agent ID')
    .requiredOption('--tool <tool>', 'Tool name (e.g. read_file, or * for wildcard)')
    .requiredOption('--server <name>', 'MCP server name')
    .action(async (opts: { agent: string; tool: string; server: string }) => {
      requireAuth()

      // Resolve server name → UUID
      const serverPage = await get<MCPServerPage>('/api/v1/mcp-servers', { skip: 0, limit: 200 })
      const server = serverPage.items.find(
        (s) => s.name.toLowerCase() === opts.server.toLowerCase()
      )
      if (!server) {
        printError(`MCP server '${opts.server}' not found.`)
      }

      // Find the permission matching agent + server + tool
      let page: PermissionPage
      try {
        page = await get<PermissionPage>(`/api/v1/agents/${opts.agent}/permissions`)
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          printError('Agent not found.')
        }
        throw err
      }

      const permission = page.items.find(
        (p) => p.mcp_server_id === server.id && p.tool_name === opts.tool
      )
      if (!permission) {
        printError(`No permission found for tool '${opts.tool}' on server '${opts.server}'.`)
      }

      try {
        await del(`/api/v1/agents/${opts.agent}/permissions/${permission.id}`)
      } catch (err) {
        if (err instanceof ApiError) {
          printError(`API error: ${err.detail}`)
        }
        throw err
      }

      printSuccess(`Permission revoked: ${opts.agent} → ${opts.server}/${opts.tool}`)
    })
}
