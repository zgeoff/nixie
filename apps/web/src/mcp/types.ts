import type { ContractOutputs } from '@heynixie/contract';

export type McpServer = ContractOutputs['mcp']['listServers'][number];

export type McpTool = McpServer['tools'][number];
