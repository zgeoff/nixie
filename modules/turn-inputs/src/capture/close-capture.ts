import { removeRecordKey, withWriteTransaction } from '@heynixie/log';
import { listSpoolFiles } from '../intake/list-spool-files';
import { takeInSpoolFile } from '../intake/take-in-spool-file';
import type { OpenCapture, TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import type { CaptureCloseCause, TurnInputsTables } from '../utils/turn-inputs-tables';
import { writeInputMiss } from '../write-input-miss';
import { collectCaptureGaps } from './collect-capture-gaps';
import type { WriterCounter } from './collect-capture-gaps';

export interface CloseCaptureOptions {
  readonly cause: CaptureCloseCause;
  readonly callFrames: number | null;
}

// Runs in the lane. A capture that is not open is already closed, so a second close does nothing. A
// shred that fails leaves the capture marked as closing, and a rerun retries only the shred.
export async function closeCapture(
  ctx: TurnInputsContext,
  capture: OpenCapture,
  options: CloseCaptureOptions,
): Promise<void> {
  if (ctx.open.get(capture.captureID) !== capture) {
    return;
  }

  if (!capture.isClosing) {
    await writeCloseMisses(ctx, capture, options.callFrames);

    capture.isClosing = true;
  }

  await removeRecordKey(ctx.log, capture.keyID);

  await withWriteTransaction(ctx.log.writer, (tx) =>
    tx
      .$extendTables<TurnInputsTables>()
      .updateTable('turn_input_captures')
      .set({
        sealed_private_key: null,
        state: 'closed',
        close_cause: options.cause,
        closed_at: ctx.clock.now(),
        call_frames: options.callFrames,
      })
      .where('capture_id', '=', capture.captureID)
      .execute(),
  );

  ctx.open.delete(capture.captureID);
}

async function writeCloseMisses(
  ctx: TurnInputsContext,
  capture: OpenCapture,
  callFrames: number | null,
): Promise<void> {
  const directory = ctx.config?.sources[capture.source]?.directory;
  const files = directory === undefined ? [] : await listSpoolFiles(directory);
  const own = files.filter((file) => file.parsed.captureID === capture.captureID);

  if (directory !== undefined) {
    for (const file of own) {
      await takeInSpoolFile(ctx, { ...file, directory });
    }
  }

  const held = await readHeldCounters(ctx, capture.captureID);

  const left = own.filter((file) => file.parsed.kind !== 'part');
  const parts = own.filter((file) => file.parsed.kind === 'part');

  const covered = [
    ...held,
    ...left.map((file) => ({ writer: file.parsed.writer, counter: file.parsed.counter, span: 1 })),
  ];

  const reached = parts.map((file) => ({
    writer: file.parsed.writer,
    counter: file.parsed.counter,
    span: 1,
  }));

  const result = collectCaptureGaps(covered, reached);

  for (const gap of result.gaps) {
    await writeInputMiss(ctx, {
      captureID: capture.captureID,
      taskID: capture.taskID,
      stepRunID: capture.stepRunID,
      reason: 'not_received',
      count: gap.count,
      writer: gap.writer,
      counter: gap.counter,
    });
  }

  const unaccounted = Math.max(0, (callFrames ?? 0) - result.reachedTotal);

  if (unaccounted > 0) {
    await writeInputMiss(ctx, {
      captureID: capture.captureID,
      taskID: capture.taskID,
      stepRunID: capture.stepRunID,
      reason: 'not_received',
      count: unaccounted,
    });
  }
}

// Every request row of the capture in any state, and every miss that names a writer and a counter.
async function readHeldCounters(
  ctx: TurnInputsContext,
  captureID: string,
): Promise<readonly WriterCounter[]> {
  const db = getTurnInputsDB(ctx.log);

  const inputs = await db
    .selectFrom('turn_inputs')
    .select(['writer', 'counter'])
    .where('capture_id', '=', captureID)
    .execute();

  const misses = await db
    .selectFrom('turn_input_misses')
    .select(['writer', 'counter', 'count'])
    .where('capture_id', '=', captureID)
    .execute();

  return [
    ...inputs.map((row) => ({ writer: row.writer, counter: row.counter, span: 1 })),
    ...misses.flatMap((row) =>
      row.writer === null || row.counter === null
        ? []
        : [{ writer: row.writer, counter: row.counter, span: row.count }],
    ),
  ];
}
