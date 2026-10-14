import type { ScriptedReply } from '@heynixie/testing';

// Builds the scripted replies that remember each quote as its own item in the conversation: the
// model's memory.remember call, as the guest names it, with the quote as its text and its quote,
// then the checker's verdict that the owner asserted it.
export function buildCheckedRememberReplies(quotes: readonly string[]): ScriptedReply[] {
  return quotes.flatMap((quote) => [
    { toolUse: { name: 'mcp__nixie__memory_remember', input: { text: quote, quote } } },
    { toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } } },
  ]);
}
