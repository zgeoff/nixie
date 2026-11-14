import { mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createRecordKey, withWriteTransaction } from '@heynixie/log';
import type { LogTables } from '@heynixie/log';
import type { SpoolHeader } from '@heynixie/wire';
import { sql } from 'kysely';
import type { CaptureRow } from '../capture/read-capture-row';
import { removeTurnInput } from '../removal/remove-turn-input';
import type { OpenCapture, TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import { sealWithKey } from '../utils/seal-with-key';
import type { TurnInputsTables } from '../utils/turn-inputs-tables';

export interface InputBody {
  readonly capture: CaptureRow;
  readonly open: OpenCapture;
  readonly header: SpoolHeader;
  readonly upstreamStatus: number;
  readonly body: Uint8Array<ArrayBuffer>;
}

// Runs in the lane. Each step is safe to run again: the row is reserved first with its key ID, so a
// crash leaves a row that the start can find and remove. Returns false, with the row and key gone,
// when the capture closed under the intake.
export async function writeInputBody(ctx: TurnInputsContext, input: InputBody): Promise<boolean> {
  const inputID = crypto.randomUUID();
  const keyID = crypto.randomUUID();
  const reserved = { input_id: inputID, key_id: keyID, state: 'writing' } as const;

  await insertWritingRow(ctx, { inputID, keyID }, input);

  try {
    if (!isCaptureUsable(ctx, input.open) || !(await probeRowWriting(ctx, inputID))) {
      await removeTurnInput(ctx, reserved, 'restore');

      return false;
    }

    const recordKey = await createRecordKey(ctx.log, keyID);
    const sealed = await sealWithKey(recordKey.key, `${keyID}#${inputID}`, input.body);

    input.body.fill(0);

    await writeStoredFile(ctx.storeDir, inputID, sealed);
  } catch (error) {
    await removeTurnInput(ctx, reserved, 'restore').catch(() => {});

    throw error;
  }

  const isStored = await writeStored(ctx, input, inputID);

  if (!isStored) {
    await removeTurnInput(ctx, reserved, 'restore');
  }

  return isStored;
}

interface Reserved {
  readonly inputID: string;
  readonly keyID: string;
}

function insertWritingRow(
  ctx: TurnInputsContext,
  reserved: Reserved,
  input: InputBody,
): Promise<void> {
  return withWriteTransaction(ctx.log.writer, async (tx) => {
    const db = tx.$extendTables<TurnInputsTables & LogTables>();

    const head = await db
      .selectFrom('records')
      .select((eb) => eb.fn.max('sequence').as('sequence'))
      .executeTakeFirst();

    await db
      .insertInto('turn_inputs')
      .values({
        input_id: reserved.inputID,
        capture_id: input.capture.capture_id,
        task_id: input.capture.task_id,
        step_run_id: input.capture.step_run_id,
        writer: input.header.writer,
        counter: input.header.counter,
        role: input.capture.role,
        profile: input.capture.profile,
        model: input.capture.model,
        harness: input.capture.harness,
        api: input.header.api,
        endpoint: input.header.endpoint,
        route: input.header.route,
        is_rewritten: 0,
        upstream_status: input.upstreamStatus,
        bytes: input.header.bytes,
        key_id: reserved.keyID,
        intake_sequence: head?.sequence ?? 0,
        received_at: input.header.receivedAt,
        taken_at: ctx.clock.now(),
        state: 'writing',
        removed_cause: null,
      })
      .execute();
  });
}

function isCaptureUsable(ctx: TurnInputsContext, capture: OpenCapture): boolean {
  return ctx.open.get(capture.captureID) === capture && !capture.isClosing;
}

async function probeRowWriting(ctx: TurnInputsContext, inputID: string): Promise<boolean> {
  const row = await getTurnInputsDB(ctx.log)
    .selectFrom('turn_inputs')
    .select('state')
    .where('input_id', '=', inputID)
    .executeTakeFirst();

  return row?.state === 'writing';
}

async function writeStoredFile(
  storeDir: string,
  inputID: string,
  sealed: Uint8Array<ArrayBuffer>,
): Promise<void> {
  await mkdir(storeDir, { recursive: true, mode: 0o700 });

  const temporary = join(storeDir, `${inputID}.bin.tmp`);

  const handle = await open(temporary, 'w', 0o600);

  try {
    await handle.writeFile(sealed);
    await handle.sync();
  } finally {
    await handle.close();
  }

  await rename(temporary, join(storeDir, `${inputID}.bin`));

  const directory = await open(storeDir, 'r');

  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function writeStored(ctx: TurnInputsContext, input: InputBody, inputID: string): Promise<boolean> {
  return withWriteTransaction(ctx.log.writer, async (tx) => {
    const db = tx.$extendTables<TurnInputsTables>();

    const capture = await db
      .selectFrom('turn_input_captures')
      .select('state')
      .where('capture_id', '=', input.capture.capture_id)
      .executeTakeFirst();

    if (capture?.state !== 'open' || !isCaptureUsable(ctx, input.open)) {
      return false;
    }

    const updated = await db
      .updateTable('turn_inputs')
      .set({ state: 'stored' })
      .where('input_id', '=', inputID)
      .where('state', '=', 'writing')
      .executeTakeFirst();

    if (updated.numUpdatedRows === 0n) {
      return false;
    }

    await db
      .updateTable('turn_input_captures')
      .set({ inputs: sql`inputs + 1` })
      .where('capture_id', '=', input.capture.capture_id)
      .execute();

    return true;
  });
}
