import { expect, test } from 'bun:test';
import { buildWriterTools, createWriterStaging } from '@heynixie/memory';
import { buildWriterEvalInput } from './build-writer-eval-input';

test('it renders the production prompts over the case, with the guest names of the writer tools', () => {
  const tools = buildWriterTools(
    { recall: () => Promise.resolve({ items: [], next: null }) },
    createWriterStaging(),
    5,
  );

  const input = buildWriterEvalInput(
    { persona: 'You are Wren, a calm assistant.', ownerName: 'Sam', assistantName: 'Wren' },
    {
      id: 'porch-talk',
      items: [{ itemID: 'item-tea', subject: 'owner', text: 'Sam drinks green tea.' }],
      messages: [
        { role: 'owner', text: "Let's call our Monday chats the porch talk." },
        { role: 'assistant', text: 'Porch talk it is.' },
      ],
      rule: 'shared_item',
      target: null,
    },
    tools,
  );

  expect(input.systemPrompt).toStartWith(
    "The assistant's persona, for reference. It describes the assistant, not you:\n\nYou are Wren, a calm assistant.",
  );

  expect(input.prompt).toInclude('- item-tea (owner): Sam drinks green tea.');

  expect(input.prompt).toInclude(
    "[1] 2026-10-14 Sam (owner): Let's call our Monday chats the porch talk.",
  );

  expect(input.prompt).toInclude('[2] 2026-10-14 Wren (assistant): Porch talk it is.');

  expect(input.tools.map((tool) => tool.name)).toStrictEqual([
    'mcp__nixie__memory_recall',
    'mcp__nixie__memory_remember',
    'mcp__nixie__memory_edit',
    'mcp__nixie__memory_retire',
    'mcp__nixie__memory_flag-self-note',
  ]);

  expect(input.sources).toStrictEqual(
    new Map([[1, { sequence: 1, text: "Let's call our Monday chats the porch talk.", spans: [] }]]),
  );

  expect(input.shown).toStrictEqual(new Map([['item-tea', { version: 1, subject: 'owner' }]]));
});

test('it gives the same input the same hash, and another case another hash', () => {
  const tools = buildWriterTools(
    { recall: () => Promise.resolve({ items: [], next: null }) },
    createWriterStaging(),
    5,
  );

  const cases = { persona: 'You are Wren.', ownerName: 'Sam', assistantName: 'Wren' };

  const first = buildWriterEvalInput(
    cases,
    {
      id: 'a',
      items: [],
      messages: [{ role: 'owner', text: 'I switched to oat milk.' }],
      rule: 'owner_item',
      target: null,
    },
    tools,
  );

  const again = buildWriterEvalInput(
    cases,
    {
      id: 'a',
      items: [],
      messages: [{ role: 'owner', text: 'I switched to oat milk.' }],
      rule: 'owner_item',
      target: null,
    },
    tools,
  );

  const other = buildWriterEvalInput(
    cases,
    {
      id: 'b',
      items: [],
      messages: [{ role: 'owner', text: 'I switched to soy milk.' }],
      rule: 'owner_item',
      target: null,
    },
    tools,
  );

  expect(first.hash).toStartWith('sha256:');
  expect(again.hash).toBe(first.hash);
  expect(other.hash).not.toBe(first.hash);
});
