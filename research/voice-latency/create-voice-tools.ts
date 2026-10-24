// The stub tools as an in-process MCP server, so a timed Agent SDK turn holds a real tool call
// without reaching any outside service.
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { stubTools } from './stub-tool-answers.ts';

export const voiceToolNames = ['mcp__voice__read_weather', 'mcp__voice__read_calendar', 'mcp__voice__create_timer'];

export function createVoiceTools(): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    alwaysLoad: true,
    name: 'voice',
    tools: [
      tool('read_weather', stubTools.read_weather.description, { city: z.string(), day: z.string() }, () =>
        Promise.resolve(replyWith(stubTools.read_weather.answer)),
      ),
      tool('read_calendar', stubTools.read_calendar.description, { day: z.string() }, () =>
        Promise.resolve(replyWith(stubTools.read_calendar.answer)),
      ),
      tool('create_timer', stubTools.create_timer.description, { label: z.string(), minutes: z.number() }, () =>
        Promise.resolve(replyWith(stubTools.create_timer.answer)),
      ),
    ],
  });
}

function replyWith(text: string): { content: { text: string; type: 'text' }[] } {
  return { content: [{ text, type: 'text' }] };
}
