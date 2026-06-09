import { Command } from 'commander'
import { get } from '../lib/api.js'
import { requireAuth, getConfig } from '../lib/config.js'
import { printError } from '../lib/output.js'
import type { MCPServerPage } from '../types/index.js'
import axios from 'axios'

interface ToolCallResponse {
  result: unknown
  cache_hit: boolean
  duration_ms: number
}

export function registerTestCall(program: Command): void {
  program
    .command('test-call')
    .description('Fire a tool call through the gateway from the terminal')
    .requiredOption('--server <name>', 'MCP server name')
    .requiredOption('--tool <tool>', 'Tool name to invoke')
    .option('--params <json>', 'Tool arguments as a JSON string (default: {})', '{}')
    .option('--agent-key <key>', 'Agent API key (overrides config)')
    .option('--json', 'Output raw JSON response')
    .action(
      async (opts: {
        server: string
        tool: string
        params: string
        agentKey?: string
        json?: boolean
      }) => {
        requireAuth()

        // Resolve server name → validate it exists
        const serverPage = await get<MCPServerPage>('/api/v1/mcp-servers', { skip: 0, limit: 200 })
        const server = serverPage.items.find(
          (s) => s.name.toLowerCase() === opts.server.toLowerCase()
        )
        if (!server) {
          printError(`MCP server '${opts.server}' not found.`)
        }

        let params: Record<string, unknown>
        try {
          params = JSON.parse(opts.params) as Record<string, unknown>
        } catch {
          printError('--params must be valid JSON, e.g. \'{"path": "/tmp/test.txt"}\'')
        }

        const cfg = getConfig()
        const apiKey = opts.agentKey

        if (!apiKey) {
          printError(
            'An agent API key is required for proxy calls.\n' +
              'Pass --agent-key <key> or create an agent with `arbiter agent create`.'
          )
        }

        const baseUrl = (process.env['ARBITER_API_URL'] ?? cfg?.api_url ?? 'https://api.arbiterai.dev').replace(/\/$/, '')

        let result: ToolCallResponse
        try {
          const res = await axios.post<ToolCallResponse>(
            `${baseUrl}/api/v1/proxy/tool-call`,
            { server_name: opts.server, tool_name: opts.tool, params },
            { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
          )
          result = res.data
        } catch (err) {
          if (axios.isAxiosError(err)) {
            const detail = (err.response?.data as { detail?: string })?.detail ?? err.message
            printError(`Tool call failed (HTTP ${err.response?.status ?? 0}): ${detail}`)
          }
          throw err
        }

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2))
          return
        }

        const cacheTag = result.cache_hit ? ' [cached]' : ''
        console.log(`\n  ✓  ${opts.tool} on ${opts.server}${cacheTag} — ${result.duration_ms}ms\n`)
        console.log(JSON.stringify(result.result, null, 2))
        console.log()
      }
    )
}
