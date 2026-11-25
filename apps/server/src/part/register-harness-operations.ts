import { createHash } from 'node:crypto';
import { closeSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import type { CallsContext } from '@heynixie/calls';
import { connectCall, startCall } from '@heynixie/calls';
import { writeDevicePackage } from '@heynixie/devices';
import type { MemoryMailHost } from '@heynixie/mail/memory-host';
import type { TasksContext } from '@heynixie/tasks';
import { createTask, writeInboxRecords, writeTaskControl } from '@heynixie/tasks';
import type { HarnessLink } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildNixieOperationSchemas } from './build-nixie-operation-schemas';
import { harnessSpeech } from './harness-speech';

export function registerHarnessOperations(
  link: HarnessLink,
  context: TasksContext,
  calls: CallsContext | undefined,
  mail: MemoryMailHost | null,
): void {
  const schemas = buildNixieOperationSchemas();

  link.registerOperation('sendMessage', schemas.sendMessage, async (message) => {
    const [record] = await writeInboxRecords(context, [
      {
        kind: 'owner_message',
        definitions: context.definitions(),
        thread: message.thread,
        erasable: {
          text: message.text,
          spans: [{ start: 0, end: message.text.length, source: 'typed' }],
        },
      },
    ]);

    return record?.sequence ?? null;
  });

  link.registerOperation('createTask', schemas.createTask, (task) =>
    createTask(context, task.brief, task.taskID),
  );

  link.registerOperation('finishTask', schemas.finishTask, async (task) => {
    const [record] = await writeInboxRecords(context, [
      {
        kind: 'owner_message',
        definitions: context.definitions(),
        thread: task.taskID,
        payload: { finish: true },
      },
    ]);

    return record?.sequence ?? null;
  });

  link.registerOperation('controlTask', schemas.controlTask, async (request) => {
    const outcome = await writeTaskControl(context, request);

    return outcome.status === 'controlled' ? outcome.sequence : null;
  });

  registerCallOperations(link, calls);

  link.registerOperation('deliverMail', schemas.deliverMail, (incoming) => {
    if (mail === null) {
      throw new Error('the config sets no mail section, so the test build has no mailbox');
    }

    return mail.deliver(incoming).hostMessageID;
  });

  link.registerOperation('approvePackage', schemas.approvePackage, async () => {
    const bytes = new TextEncoder().encode('window.rippleCount = 7;');

    await writeDevicePackage(context, {
      name: 'ripple-count',
      version: '1.0.0',
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      publisher: 'a-publisher',
      files: [{ path: 'ripples.js', bytes }],
      thread: 'conversation',
    });

    return null;
  });

  link.registerOperation('releaseWriterLock', schemas.releaseWriterLock, () => {
    removeLockDescriptor(context.log.writer.dataDir);

    return null;
  });
}

// The harness starts a call as the user and connects it with no device, then plays the provider.
function registerCallOperations(link: HarnessLink, calls: CallsContext | undefined): void {
  const schemas = buildNixieOperationSchemas();

  link.registerOperation('placeHarnessCall', schemas.placeHarnessCall, async () => {
    invariant(calls !== undefined, 'the test build holds no calls');

    const started = await startCall(calls, { carryingSession: 'harness-session' });

    invariant(started.status === 'started', `the call did not start: ${JSON.stringify(started)}`);

    const connected = await connectCall(calls, {
      callID: started.callID,
      session: 'harness-session',
      sdpOffer: 'offer',
      probeCaller: () => Promise.resolve(true),
    });

    invariant(
      connected.status === 'connected',
      `the call did not connect: ${JSON.stringify(connected)}`,
    );

    return started.callID;
  });

  link.registerOperation('emitSpeech', schemas.emitSpeech, (emit) => {
    harnessSpeech?.emit(emit.sessionID, emit.event);

    return null;
  });

  link.registerOperation('readSpeechCalls', schemas.readSpeechCalls, () =>
    structuredClone(harnessSpeech?.calls ?? []),
  );
}

// The writer lock is a flock on the data directory itself, so its descriptor points at the directory.
function removeLockDescriptor(dataDir: string): void {
  const target = realpathSync(dataDir);

  const fd = readdirSync('/proc/self/fd')
    .map(Number)
    .find((candidate) => readDescriptorPath(candidate) === target);

  if (fd === undefined) {
    throw new Error(`no descriptor of this process names ${dataDir}`);
  }

  closeSync(fd);
}

function readDescriptorPath(fd: number): string | null {
  try {
    return readlinkSync(`/proc/self/fd/${fd}`);
  } catch {
    return null;
  }
}
