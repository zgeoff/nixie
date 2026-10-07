// Runs one Agent SDK query with every built-in tool off and only nixie's tools offered, and prints a
// compact timeline. host-a.ts and guest.ts differ only in the MCP server and the env they pass.
import type { McpServerConfig, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { probePrompt, prompt, toolSpecs } from './tools.ts';

const started = Date.now();

function formatShort(value: unknown): string {
  return JSON.stringify(value).slice(0, 200);
}

function printLine(text: string): void {
  console.log(`${`${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(7)} ${text}`);
}

function printContent(message: SDKMessage): void {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'text') {
        printLine(`assistant ${formatShort(block.text)}`);
      } else if (block.type === 'tool_use') {
        printLine(`tool_use ${block.name} ${formatShort(block.input)}`);
      }
    }
  } else if (message.type === 'user' && Array.isArray(message.message.content)) {
    for (const block of message.message.content) {
      if (block.type === 'tool_result') {
        printLine(
          `tool_result${block.is_error ? ' (is_error)' : ''} ${formatShort(block.content)}`,
        );
      }
    }
  }
}

function printInit(message: Extract<SDKMessage, { subtype: 'init' }>): void {
  printLine(`init cli=${message.claude_code_version} model=${message.model}`);
  printLine(`init tools=${JSON.stringify(message.tools)}`);
  printLine(`init mcp_servers=${JSON.stringify(message.mcp_servers)}`);
  printLine(`init permissionMode=${message.permissionMode}`);
  printLine(`init slash_commands=${JSON.stringify(message.slash_commands)}`);
}

function printMessage(message: SDKMessage): void {
  if (message.type === 'system' && message.subtype === 'init') {
    printInit(message);
  } else if (message.type === 'result') {
    printLine(
      `result ${message.subtype} turns=${message.num_turns} stop_reason=${message.stop_reason}`,
    );
    if (message.subtype === 'success') {
      printLine(`result text ${JSON.stringify(message.result)}`);
    }
  } else if (message.type === 'system' && message.subtype !== 'thinking_tokens') {
    printLine(`system ${message.subtype} ${formatShort(message).slice(0, 120)}`);
  } else {
    printContent(message);
  }
}

export async function runSession(
  nixie: McpServerConfig,
  env: Record<string, string>,
  debugFile?: string,
): Promise<void> {
  const session = query({
    options: {
      allowedTools: toolSpecs.map((spec) => `mcp__nixie__${spec.name}`),
      debugFile,
      env,
      maxTurns: 10,
      mcpServers: { nixie },
      model: 'claude-haiku-4-5-20251001',
      permissionMode: 'default',
      permissionPrompts: 'none',
      settingSources: [],
      stderr: (data) => {
        for (const line of data.trimEnd().split('\n')) {
          printLine(`stderr ${line}`);
        }
      },
      strictMcpConfig: true,
      tools: [],
    },
    prompt: process.argv.includes('--probe') ? probePrompt : prompt,
  });
  for await (const message of session) {
    printMessage(message);
  }
}
