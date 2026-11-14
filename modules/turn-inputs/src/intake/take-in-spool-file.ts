import { lstat, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { openSpoolFile, spoolMissSchema } from '@heynixie/wire';
import type { CaptureRow } from '../capture/read-capture-row';
import { readCaptureRow } from '../capture/read-capture-row';
import { removeTurnInput } from '../removal/remove-turn-input';
import { runRetentionSweep } from '../removal/run-retention-sweep';
import type { TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import type { InputMissReason } from '../utils/turn-inputs-tables';
import { writeInputMiss } from '../write-input-miss';
import type { SpoolEntry } from './list-spool-files';
import { writeInputBody } from './write-input-body';

export interface SpoolFile extends SpoolEntry {
  readonly directory: string;
}

// Runs in the lane. A thrown error counts as a failed intake and leaves the file for the next tick,
// and the fifth failure in a row gives one `intake_failed` miss and removes the file.
export async function takeInSpoolFile(ctx: TurnInputsContext, file: SpoolFile): Promise<void> {
  try {
    const isStored = await takeInOnce(ctx, file);

    ctx.failures.delete(file.name);

    if (isStored) {
      await runRetentionSweep(ctx);
    }
  } catch {
    await countFailure(ctx, file);
  }
}

const bodyLimitBytes = 64 * 1024 * 1024 + 64 * 1024;

// Returns true when the file became a stored request.
async function takeInOnce(ctx: TurnInputsContext, file: SpoolFile): Promise<boolean> {
  if (file.parsed.kind === 'part') {
    return false;
  }

  const path = join(file.directory, file.name);

  const info = await lstat(path).catch(() => null);

  if (info === null) {
    return false;
  }

  const capture = await readCaptureRow(ctx, file.parsed.captureID);

  if (capture === null) {
    await rm(path, { recursive: true, force: true });

    ctx.logger('turn_input.unknown_capture', { reason: 'no_capture_row' }, 'warn');

    return false;
  }

  if (!info.isFile() || info.size > bodyLimitBytes) {
    await rm(path, { recursive: true, force: true });
    await writeMissOfFile(ctx, file, 'undecodable');

    return false;
  }

  const open = ctx.open.get(capture.capture_id);

  if (capture.state !== 'open' || open === undefined || open.isClosing) {
    await writeMissOfFile(ctx, file, 'capture_closed');
    await rm(path, { force: true });

    return false;
  }

  if (file.parsed.kind === 'miss') {
    await takeInMiss(ctx, file, path, capture);

    return false;
  }

  return takeInBody(ctx, file, path, { capture, open });
}

async function writeMissOfFile(
  ctx: TurnInputsContext,
  file: SpoolFile,
  reason: InputMissReason,
): Promise<void> {
  const capture = await readCaptureRow(ctx, file.parsed.captureID);

  if (capture === null) {
    return;
  }

  await writeInputMiss(ctx, {
    captureID: capture.capture_id,
    taskID: capture.task_id,
    stepRunID: capture.step_run_id,
    reason,
    writer: file.parsed.writer,
    counter: file.parsed.counter,
  });
}

async function takeInMiss(
  ctx: TurnInputsContext,
  file: SpoolFile,
  path: string,
  capture: CaptureRow,
): Promise<void> {
  const text = await readFile(path, 'utf8');

  const miss = spoolMissSchema.safeParse(parseJSON(text));

  const isMatch =
    miss.success &&
    miss.data.captureID === file.parsed.captureID &&
    miss.data.writer === file.parsed.writer &&
    miss.data.counter === file.parsed.counter;

  await writeInputMiss(ctx, {
    captureID: capture.capture_id,
    taskID: capture.task_id,
    stepRunID: capture.step_run_id,
    reason: isMatch ? miss.data.reason : 'undecodable',
    writer: file.parsed.writer,
    counter: file.parsed.counter,
  });

  await rm(path, { force: true });
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface BodyTarget {
  readonly capture: CaptureRow;
  readonly open: NonNullable<ReturnType<TurnInputsContext['open']['get']>>;
}

async function takeInBody(
  ctx: TurnInputsContext,
  file: SpoolFile,
  path: string,
  target: BodyTarget,
): Promise<boolean> {
  const bytes = await readFile(path);
  const opened = await openSpoolFile(new Uint8Array(bytes), target.open.privateKey);

  const header = opened?.header;

  if (
    opened === null ||
    file.parsed.kind !== 'cap' ||
    header?.captureID !== file.parsed.captureID ||
    header.writer !== file.parsed.writer ||
    header.counter !== file.parsed.counter
  ) {
    await writeMissOfFile(ctx, file, 'undecodable');
    await rm(path, { force: true });

    return false;
  }

  const existing = await getTurnInputsDB(ctx.log)
    .selectFrom('turn_inputs')
    .select(['input_id', 'key_id', 'state'])
    .where('capture_id', '=', header.captureID)
    .where('writer', '=', header.writer)
    .where('counter', '=', header.counter)
    .executeTakeFirst();

  if (existing !== undefined && existing.state !== 'writing') {
    await rm(path, { force: true });

    return false;
  }

  if (existing !== undefined) {
    await removeTurnInput(ctx, existing, 'restore');
  }

  if (ctx.holdsOwnValue(opened.body)) {
    opened.body.fill(0);

    await writeMissOfFile(ctx, file, 'holds_own_value');
    await rm(path, { force: true });

    return false;
  }

  const isStored = await writeInputBody(ctx, {
    ...target,
    header,
    upstreamStatus: file.parsed.upstreamStatus,
    body: new Uint8Array(opened.body),
  });

  opened.body.fill(0);

  if (!isStored) {
    await writeMissOfFile(ctx, file, 'capture_closed');
  }

  await rm(path, { force: true });

  return isStored;
}

const failureLimit = 5;

async function countFailure(ctx: TurnInputsContext, file: SpoolFile): Promise<void> {
  const failures = (ctx.failures.get(file.name) ?? 0) + 1;

  if (failures < failureLimit) {
    ctx.failures.set(file.name, failures);

    return;
  }

  ctx.failures.delete(file.name);
  ctx.logger('turn_input.intake_failed', { captureID: file.parsed.captureID }, 'warn');

  try {
    await writeMissOfFile(ctx, file, 'intake_failed');
    await rm(join(file.directory, file.name), { force: true });
  } catch {
    ctx.logger('turn_input.intake_cleanup_failed', { captureID: file.parsed.captureID }, 'warn');
  }
}
