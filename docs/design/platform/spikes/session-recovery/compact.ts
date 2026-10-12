// Checks what decides the content of an SDK compaction summary, and whether the automatic path
// writes the same entries as /compact. Usage: bun --no-env-file compact.ts <empty-dir> [repeats]
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Task } from './cli';
import { createTask, findBoundary, findCompactSummary, getEntryText, getSpent, loadTranscript, runTurn } from './cli';

const root = process.argv.at(2);
const repeats = Number(process.argv.at(3) ?? '3');

if (root === undefined || !existsSync(root) || readdirSync(root).length > 0) {
  throw new Error('usage: compact.ts <empty-dir> [repeats]');
}

const nixiePrompt = [
  'You are nixie, a personal assistant working on one task for one user.',
  'Lines that start with [nixie] are records from nixie, not from the user.',
  'A [nixie state] block holds the current proposal and action state and overrides anything earlier.',
  'Never say an action succeeded unless a nixie record says so. Keep replies short.',
].join(' ');
const neutralPrompt = 'You are a helpful assistant.';
const facts = [
  'Hi! I am sorting out a weekend trip to the island. The cottage booking reference is QX-4417-B, keep it handy. Reply in one short sentence.',
  'Please book the Saturday 08:40 ferry for two.\n[nixie] Proposal P-1 (book the Saturday 08:40 ferry for two, 84 GBP) is pending approval.',
  'The cottage key-box code is 5190. Also give me a five-item packing list for a rainy weekend.',
];
const instructions =
  '/compact Keep every reference number, code, name, and proposal or action ID with its last known state.';

interface Holds {
  ref: boolean;
  code: boolean;
  proposal: boolean;
}

function checkSummary(summary: string | undefined): Holds {
  const text = summary ?? '';
  return { ref: text.includes('QX-4417-B'), code: text.includes('5190'), proposal: text.includes('P-1') };
}

async function setupConversation(task: Task): Promise<{ sessionID: string; boundary: string }> {
  let resume: { sessionID: string; boundary: string } | undefined;
  for (const inbox of facts) {
    // oxlint-disable-next-line no-await-in-loop -- each turn resumes the one before it
    const result = await runTurn(
      task,
      inbox,
      resume === undefined ? undefined : { sessionID: resume.sessionID, messageID: resume.boundary, fork: true },
    );
    resume = { sessionID: result.sessionID, boundary: findBoundary(loadTranscript(task, result.sessionID)) };
  }
  if (resume === undefined) {
    throw new Error('no turns');
  }
  return resume;
}

// the same conversation compacted under each system prompt, with and without instructions
async function runPromptComparison(): Promise<void> {
  const cases = [
    { label: 'nixie prompt, /compact', prompt: nixiePrompt, command: '/compact' },
    { label: 'nixie prompt, /compact with instructions', prompt: nixiePrompt, command: instructions },
    { label: 'neutral prompt, /compact', prompt: neutralPrompt, command: '/compact' },
  ];
  for (const testCase of cases) {
    const task = createTask(join(root ?? '', testCase.label.replace(/[^a-z]+/g, '-')), testCase.prompt, undefined);
    // oxlint-disable-next-line no-await-in-loop -- one model call at a time
    const committed = await setupConversation(task);
    const held: Holds[] = [];
    for (let index = 0; index < repeats; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one model call at a time
      const compacted = await runTurn(task, testCase.command, {
        sessionID: committed.sessionID,
        messageID: committed.boundary,
        fork: true,
      });
      held.push(checkSummary(findCompactSummary(loadTranscript(task, compacted.sessionID))));
    }
    const count = (key: keyof Holds): number => held.filter((holds) => holds[key]).length;
    console.log(
      `${testCase.label}: summary holds the reference ${count('ref')}/${repeats}, the code ${count('code')}/${repeats}, P-1 ${count('proposal')}/${repeats}`,
    );
  }
}

// a context past a small automatic window, then one more turn, to see the automatic path
async function runAutoCompaction(): Promise<void> {
  const task = createTask(join(root ?? '', 'auto'), nixiePrompt, undefined);
  const committed = await setupConversation(task);
  const filler = Array.from(
    { length: 3800 },
    (_, index) =>
      `Tide note ${String(index).padStart(4, '0')}: the harbour gauge read ${(index * 37) % 500} cm at ${String(index % 24).padStart(2, '0')}:00, wind from the ${['north', 'east', 'south', 'west'][index % 4]}.`,
  ).join('\n');
  const pasted = await runTurn(task, `Here are the tide notes for the season. Reply OK only.\n${filler}`, {
    sessionID: committed.sessionID,
    messageID: committed.boundary,
    fork: true,
  });
  console.log(`auto: pasted turn sent ${pasted.inputTokens} input tokens`);
  const next = await runTurn(
    task,
    'What is the cottage booking reference and the key-box code? One line.',
    { sessionID: pasted.sessionID, messageID: findBoundary(loadTranscript(task, pasted.sessionID)), fork: true },
    { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100000' },
  );
  const entries = loadTranscript(task, next.sessionID);
  const boundaries = entries.filter((entry) => entry.subtype === 'compact_boundary').length;
  const summary = findCompactSummary(entries);
  const chain = entries.filter((entry) => entry.type === 'user' || entry.type === 'assistant');
  const after = chain.slice(chain.findIndex((entry) => entry.isCompactSummary === true) + 1);
  console.log(
    `auto: compact boundaries=${boundaries}, summary holds ${JSON.stringify(checkSummary(summary))}, chain messages after the summary=${after.length} (${after.map((entry) => `${entry.type}:${getEntryText(entry).slice(0, 30)}`).join(' | ')})`,
  );
  console.log(`auto: answer=${JSON.stringify(next.text)} input tokens=${next.inputTokens}`);
}

await runPromptComparison();
await runAutoCompaction();
console.log(`total spent $${getSpent().toFixed(3)}`);
