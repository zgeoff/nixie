/* oxlint-disable no-await-in-loop -- one approver tries its approvals one after another */
// One approver process: it waits for a shared start time, tries to consume every approval in a
// random order with the hash it would propose, and prints how many it won.
// Usage: bun approve.ts <worker_id> <start_at_ms>
import type { Actor } from './core.ts';
import { useApproval } from './core.ts';
import { createStore, readKind } from './db.ts';

interface Tally {
  won: number;
  errors: number;
  lastError: string;
}

async function tryApproval(actor: Actor, id: string, tally: Tally): Promise<void> {
  try {
    const won = await useApproval(actor, id, `hash-${id}`);
    tally.won += Number(won);
  } catch (error) {
    tally.errors += 1;
    tally.lastError = String(error).slice(0, 200);
  }
}

async function runApprover(worker: string, startAt: number): Promise<void> {
  const actor: Actor = { mode: 'immediate', store: createStore(readKind(), 2), worker },
    rows = await actor.store.db.selectFrom('approvals').select('id').execute(),
    shuffled = rows.map((row) => row.id).toSorted(() => Math.random() - 0.5),
    tally: Tally = { errors: 0, lastError: '', won: 0 };
  await Bun.sleep(Math.max(0, startAt - Date.now()));
  for (const id of shuffled) {
    await tryApproval(actor, id, tally);
  }
  console.log(`stats ${JSON.stringify({ worker, ...tally })}`);
  await actor.store.db.destroy();
}

await runApprover(process.argv[2] ?? 'ap', Number(process.argv[3]));
process.exit(0);
