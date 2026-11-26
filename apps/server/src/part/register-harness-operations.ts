import { closeSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { runActionProposalAnswer, runMcpProposalAnswer } from '@heynixie/api';
import type { CallsContext } from '@heynixie/calls';
import { connectCall, startCall } from '@heynixie/calls';
import { readDevicePackages } from '@heynixie/devices';
import type { MemoryMailHost } from '@heynixie/mail/memory-host';
import { readPendingActionProposals } from '@heynixie/policy';
import type { TasksContext } from '@heynixie/tasks';
import { createTask, writeInboxRecords, writeTaskControl } from '@heynixie/tasks';
import type { HarnessLink } from '@heynixie/testing';
import { waitForCondition } from '@heynixie/testing';
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

  // The owner's approval of each pending device.addPackage call, which a journey cannot give with a
  // passkey: it answers as the host command does, which needs none, and the action queue then runs
  // the install as it runs any approved call. It returns once each package is stored.
  link.registerOperation('approvePackage', schemas.approvePackage, async () => {
    const pending = await readPendingActionProposals(context.log, context.clock.now());

    const installs = pending.filter((proposal) => proposal.tool === 'device.addPackage');

    if (installs.length === 0) {
      throw new Error('no call of device.addPackage waits for an answer');
    }

    const before = await readDevicePackages(context.log.writer.db);

    for (const install of installs) {
      await runActionProposalAnswer(context, { answer: 'approve', proposalID: install.shortID });
    }

    await waitForCondition(async () => {
      const stored = await readDevicePackages(context.log.writer.db);

      return stored.length >= before.length + installs.length;
    });

    return installs.length;
  });

  link.registerOperation('approveMcp', schemas.approveMcp, async (request) => {
    const approved = await runMcpProposalAnswer(context, request.change);

    if (approved === 0) {
      throw new Error(`no MCP ${request.change} proposal waits for an answer`);
    }

    return approved;
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
