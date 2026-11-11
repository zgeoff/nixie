// Moments: each flow as commented code. Not compiled. No package imports this file.
// Shapes: 02-types.ts. Where a doc and a sketch differ, the sketch wins for shapes and the doc
// wins for rules. The helper names in this file are this sketch's own, but for the names that
// 02-types.ts and the docs give.

// ---- A. A forget of a record cleans the session of the task that holds it ----

// The API module. Each step is safe to run twice, and the server's start reruns a forget that a
// crash cut short.
async function runRecordForgetCleanup(context, recordSequence) {
  // 1. The key goes first, so a rebuilt session reads the record as a gap.
  const thread = await removeForgottenKey(context, recordSequence);

  // 2. The session cleanup. The API hands it only the sequence.
  await context.readSessionCleanup()({ recordSequence });

  // 3. The finished record goes last.
  await writeRecordForgotten(context, { recordSequence, thread });
}

// The sessions module, behind the runner's cleanupSessions.
async function runTaskSessionCleanup(runner, cause: SessionCleanupCause) {
  const open = await readStartedTaskIDs(runner.options.context, { end: 'open' });
  const candidates = await readSetups(open); // { taskID, setup }

  // The runner reads the record's thread from the log by the sequence.
  const recordThread =
    'recordSequence' in cause ? await readRecordThread(runner, cause.recordSequence) : null;

  // The pick: each task that reads memory, and the task whose ID is recordThread.
  // A record on the conversation's thread adds no task, because no task has that ID.
  for (const taskID of pickCleanedTaskIDs(candidates, recordThread)) {
    await cleanTaskSession(runner, taskID, cause);
  }
}

async function cleanTaskSession(runner, taskID, cause) {
  await writeRecord('model.session_invalidated', { thread: taskID, payload: cause });
  // A kill here leaves model.session_invalidated alone on the task's thread.
  // The forget's rerun at the next start cleans the task again.
  await removeSummaryKeys(runner.options.context.log, taskID);
  await purgeGuestWhenASandboxExists(runner, taskID);
  await writeRecord('model.session_cleanup_completed', { thread: taskID, payload: cause });
}

// ---- B. buildSpanEntry lists a record's images ----

// The memory module. moment.read and readMomentExport both read a span through this function,
// so the list never depends on the caller.
function buildSpanEntry(record: LogRecord): MomentSpanEntry {
  const erasable = record.erasable;
  const isReadable = erasable.status === 'readable';

  return {
    // sequence, kind, recordedAt, source, payload, decision, text, isGap: as built
    images:
      record.kind === 'owner_message' && isReadable
        ? readPayloadImages(record.payload).map((image, index) => ({
            n: index + 1,
            mediaType: image.mediaType,
          }))
        : [],
    isCut: false,
  };
}

// A page cuts a large record by slicing its text. The cut leaves `images` whole.
function cutSpanEntry(entry: MomentSpanEntry, tokenCap: number): MomentSpanEntry {
  return { ...entry, text: sliceToFit(entry, tokenCap), isCut: true };
}

// ---- C. The agent opens an image from a pointer ----

async function runLogReadImage(call, context) {
  const image = await readOwnerImage(log, {
    thread: context.run.thread, // the caller's own thread only (open: photo thread)
    sequence: Number(call.input.eventID),
    position: call.input.number - 1,
  });

  // A forgotten message, a record of another kind, a record of another thread and a missing
  // image number all give the same answer.
  if (image === null) return error(imageUnavailable); // 02-types.ts, section E

  // moment.read spends none of the session's image caps. Each opened image counts.
  if (!context.run.session.reserveImages([image])) {
    return error(imageUnavailableSessionFull);
  }

  return ok({ eventID, number, mediaType: image.mediaType }, { images: [image] });
}

// ---- D. buildSpanEntry marks a removed record ----
// (open: redaction parts)

function pickRemovalMark(record: LogRecord, startedForgets: ReadonlySet<number>) {
  const status = record.erasable.status;

  return {
    isGap: status === 'shredded' || status === 'unreadable',
    // The mark reads record.forget_started and never record.forgotten: a crash between the key
    // and the finished record otherwise shows a removed record as a plain gap.
    // A session cleanup deletes summary keys, so a deleted key alone proves no removal.
    isRemoved: status === 'shredded' && startedForgets.has(record.sequence),
  };
}

// ---- E. A removal from the moment view ----
// (open: redaction parts)

async function showRemovalControl(record) {
  // The control shows only on a span record of a kind that the forget takes.
  if (!isForgettableKind(record.kind)) return hideControl();

  try {
    // (open: preview procedure name)
    const preview = await conversation.readForgetPreview({ thread, sequence: record.sequence });

    return showControl(removalControlLabel, preview); // momentCount, memoryItemCount
  } catch {
    // A failed preview read hides the control. The view never removes without a preview.
    return hideControl();
  }
}

async function removeRecord(record) {
  // The one forget path. The removal reaches every moment that holds the record, and the thread.
  await conversation.forget({
    clientActionID: crypto.randomUUID(),
    thread,
    sequence: record.sequence,
  });
}
