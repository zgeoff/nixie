import type { ScriptedReply } from '@heynixie/testing';

export function buildCheckedRememberReplies(quotes: readonly string[]): ScriptedReply[] {
  return quotes.flatMap((quote) => [
    { toolUse: { name: 'mcp__nixie__memory_remember', input: { text: quote, quote } } },
    { toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } } },
  ]);
}
