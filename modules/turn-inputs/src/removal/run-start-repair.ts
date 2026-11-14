import { access, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { readRecordKeys, removeRecordKey, withWriteTransaction } from '@heynixie/log';
import { buildCaptureAAD } from '../capture/build-capture-aad';
import { closeCapture } from '../capture/close-capture';
import { readCaptureAnswers } from '../capture/read-capture-answers';
import type { CaptureRow } from '../capture/read-capture-row';
import type { OpenCapture, TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import { openWithKey } from '../utils/open-with-key';
import type { TurnInputsTables } from '../utils/turn-inputs-tables';
import { removeTurnInput } from './remove-turn-input';
import { runRetentionSweep } from './run-retention-sweep';

// Runs once at the start, before the first step. It asks each gateway whether it can capture, then
// repairs what a stop left behind, whether or not the log is on now.
export async function runStartRepair(ctx: TurnInputsContext): Promise<void> {
  await readCaptureAnswers(ctx);

  await ctx.lane.run(async () => {
    await repairOpenCaptures(ctx);
    await removeWritingRows(ctx);
    await markMissingRows(ctx);
    await removeStrayFiles(ctx);
    await runRetentionSweep(ctx);
  });
}

async function repairOpenCaptures(ctx: TurnInputsContext): Promise<void> {
  const rows = await getTurnInputsDB(ctx.log)
    .selectFrom('turn_input_captures')
    .selectAll()
    .where('state', '=', 'open')
    .execute();

  for (const row of rows) {
    try {
      const capture = await readOpenCapture(ctx, row);

      if (capture === null) {
        await closeOrphanCapture(ctx, row);

        continue;
      }

      ctx.open.set(capture.captureID, capture);

      await closeCapture(ctx, capture, { cause: 'start', callFrames: null });
    } catch {
      ctx.logger('turn_input.close_failed', { captureID: row.capture_id, reason: 'start' }, 'warn');
    }
  }
}

// A capture whose key is gone cannot take in its files.
async function readOpenCapture(
  ctx: TurnInputsContext,
  row: CaptureRow,
): Promise<OpenCapture | null> {
  if (row.key_id === null || row.sealed_private_key === null) {
    return null;
  }

  const keys = await readRecordKeys(ctx.log, [row.key_id]);

  const key = keys.get(row.key_id);

  if (key === undefined || key === null) {
    return null;
  }

  const pkcs8 = await openWithKey(
    key,
    buildCaptureAAD(row.key_id, row.capture_id),
    row.sealed_private_key,
  );

  if (pkcs8 === null) {
    return null;
  }

  const privateKey = await crypto.subtle
    .importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    .finally(() => {
      pkcs8.fill(0);
    });

  return {
    captureID: row.capture_id,
    taskID: row.task_id,
    stepRunID: row.step_run_id,
    role: row.role,
    profile: row.profile,
    model: row.model,
    harness: row.harness,
    source: row.source,
    keyID: row.key_id,
    privateKey,
    isClosing: false,
  };
}

// An absent key row never proves that the shred finished, because a delete commits before its
// checkpoint, so the close runs the checkpoint and marks the row closed only after it succeeds.
async function closeOrphanCapture(ctx: TurnInputsContext, row: CaptureRow): Promise<void> {
  await removeRecordKey(ctx.log, row.key_id ?? crypto.randomUUID());

  await withWriteTransaction(ctx.log.writer, (tx) =>
    tx
      .$extendTables<TurnInputsTables>()
      .updateTable('turn_input_captures')
      .set({
        sealed_private_key: null,
        state: 'closed',
        close_cause: 'start',
        closed_at: ctx.clock.now(),
      })
      .where('capture_id', '=', row.capture_id)
      .execute(),
  );
}

async function removeWritingRows(ctx: TurnInputsContext): Promise<void> {
  const rows = await getTurnInputsDB(ctx.log)
    .selectFrom('turn_inputs')
    .select(['input_id', 'key_id', 'state'])
    .where('state', '=', 'writing')
    .execute();

  for (const row of rows) {
    try {
      await removeTurnInput(ctx, row, 'restore');
    } catch {
      ctx.logger('turn_input.remove_failed', { reason: 'restore' }, 'warn');
    }
  }
}

async function markMissingRows(ctx: TurnInputsContext): Promise<void> {
  const rows = await getTurnInputsDB(ctx.log)
    .selectFrom('turn_inputs')
    .select('input_id')
    .where('state', '=', 'stored')
    .execute();

  for (const row of rows) {
    const hasFile = await access(join(ctx.storeDir, `${row.input_id}.bin`)).then(
      () => true,
      () => false,
    );

    if (!hasFile) {
      await withWriteTransaction(ctx.log.writer, (tx) =>
        tx
          .$extendTables<TurnInputsTables>()
          .updateTable('turn_inputs')
          .set({ state: 'missing' })
          .where('input_id', '=', row.input_id)
          .where('state', '=', 'stored')
          .execute(),
      );
    }
  }
}

const storedFilePattern = /^(?<inputID>[0-9a-f-]{36})\.bin(?:\.tmp)?$/u;

async function removeStrayFiles(ctx: TurnInputsContext): Promise<void> {
  const names = await readdir(ctx.storeDir).catch(() => []);

  const held = await getTurnInputsDB(ctx.log)
    .selectFrom('turn_inputs')
    .select('input_id')
    .where('state', 'in', ['writing', 'stored'])
    .execute();

  const heldIDs = new Set(held.map((row) => row.input_id));

  for (const name of names) {
    const inputID = storedFilePattern.exec(name)?.groups?.['inputID'];

    if (inputID !== undefined && !heldIDs.has(inputID)) {
      await rm(join(ctx.storeDir, name), { force: true });
    }
  }
}
