// Three tools with fixed answers, one for each caller line that needs a tool, so a timed turn holds a
// real tool call without reaching any outside service.
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const voiceToolNames = [
  'mcp__voice__read_weather',
  'mcp__voice__read_calendar',
  'mcp__voice__create_timer',
];

export function createVoiceTools(): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    alwaysLoad: true,
    name: 'voice',
    tools: [
      tool(
        'read_weather',
        "Reads the forecast for a city and day.",
        { city: z.string(), day: z.string() },
        () => Promise.resolve(replyWith('17 degrees, light rain until noon, then sunny spells, wind 12 km/h.')),
      ),
      tool(
        'read_calendar',
        "Reads the events on the person's calendar for a day.",
        { day: z.string() },
        () => Promise.resolve(replyWith('9:30 dentist; 13:00 book club lunch; 18:00 climbing.')),
      ),
      tool(
        'create_timer',
        'Starts a countdown timer.',
        { label: z.string(), minutes: z.number() },
        () => Promise.resolve(replyWith('Timer started.')),
      ),
    ],
  });
}

function replyWith(text: string): { content: { text: string; type: 'text' }[] } {
  return { content: [{ text, type: 'text' }] };
}
