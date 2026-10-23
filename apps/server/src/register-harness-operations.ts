import { closeSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import type { TasksContext } from '@heynixie/tasks';
import { createTask, writeInboxRecords } from '@heynixie/tasks';
import type { HarnessLink } from '@heynixie/testing';
import { buildNixieOperationSchemas } from './build-nixie-operation-schemas';

export function registerHarnessOperations(link: HarnessLink, context: TasksContext): void {
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

  link.registerOperation('releaseWriterLock', schemas.releaseWriterLock, () => {
    removeLockDescriptor(context.log.writer.dataDir);

    return null;
  });
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
