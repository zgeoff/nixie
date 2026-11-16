import { renderSystemMessage } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { buildFiller } from './build-filler';
import { buildProbeOptions } from './build-probe-options';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import type { ProbeTarget } from './types';

const systemPrompt =
  'You are a terse assistant in a test. A system-message element in a user message comes from ' +
  'the platform. A pinned-memory-changes element holds the newest value of a pinned item, and ' +
  'it replaces the value in the earlier pinned-memory element. Follow the instructions exactly.';

const question = "What is the owner's code word now? Answer with the word only.";
const changedValues = ['BANANA', 'CHERRY'] as const;

// The first turn opens with a full pinned block and a full index. Each later turn resumes the
// session and carries one pinned item's new value, so the runs after the first show whether the
// model answers from the change and not from the opening.
export async function runMemoryIndexProbe(target: ProbeTarget): Promise<readonly ContractRun[]> {
  const options = {
    ...buildProbeOptions(target),
    systemPrompt: { type: 'custom' as const, prompt: systemPrompt, snapshot: false },
  };

  const first = await runContractQuery({
    prompt: [buildOpening(), question].join('\n\n'),
    options,
  });

  const runs = [first];
  let sessionID = first.messages.at(-1)?.session_id;

  for (const value of changedValues) {
    invariant(sessionID !== undefined, 'a turn of the memory-index probe ended with no session');

    const run = await runContractQuery({
      prompt: [buildChange(value), question].join('\n\n'),
      options: { ...options, resume: sessionID },
    });

    runs.push(run);

    sessionID = run.messages.at(-1)?.session_id;
  }

  return runs;
}

const at = 'Tue 14 Oct, 22:50, Sydney';

function buildOpening(): string {
  const pinned = ["[w8d2n5rt1c] The owner's code word is APPLE.", buildFiller(1900, 'pinned')].join(
    '\n',
  );

  return [
    renderSystemMessage({ type: 'status', at, body: '- Memory index: 400 items' }),
    renderSystemMessage({ type: 'pinned-memory', at, body: pinned }),
    renderSystemMessage({ type: 'memory-index', at, body: buildIndex() }),
  ].join('\n');
}

// About 3,000 tokens of rows in the index layout: a topic, its count, then items as ID and gist.
function buildIndex(): string {
  const rows = Array.from({ length: 40 }, (_, row) => {
    const items = Array.from(
      { length: 4 },
      (_item, item) =>
        `[i${String(row).padStart(3, '0')}${String(item)}x] the harbour log for bay ${String(row)} entry ${String(item)}`,
    ).join(' · ');

    return `  bay-${String(row).padStart(2, '0')} (${String(4)})  ${items}`;
  });

  return [
    'Memory index of the owner. Read an item with memory.recall.',
    'About the owner:',
    ...rows,
  ].join('\n');
}

function buildChange(value: string): string {
  return renderSystemMessage({
    type: 'pinned-memory-changes',
    at,
    body: `- Changed [w8d2n5rt1c]: The owner's code word is ${value}.`,
  });
}
