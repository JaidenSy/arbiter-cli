import { Command } from 'commander'
import { registerMcpServersList } from './list.js'

export function registerMcpServersCommands(program: Command): void {
  const mcpServersCmd = program
    .command('mcp-servers')
    .description('Manage registered MCP servers')

  registerMcpServersList(mcpServersCmd)
}
