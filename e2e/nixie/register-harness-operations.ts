import { closeSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import type { TasksContext } from '@heynixie/tasks';
import { createTask, writeInboxRecords } from '@heynixie/tasks';
import type { HarnessLink } from '@heynixie/testing';
import { z } from 'zod';

// Registers the operations a crash test asks the test build of nixie to run, by name. Each write
// returns the sequence or the ID it made, and releaseWriterLock is the stale writer test's hook.
export function registerHarnessOperations(link: HarnessLink, context: TasksContext): void {
  const messageSchema = z.object({ thread: z.string(), text: z.string() });

  link.registerOperation('sendMessage', messageSchema, async (message) => {
    const [record] = await writeInboxRecords(context, [
      {
        kind: 'owner_message',
        definitions: context.definitions(),
        thread: message.thread,
        erasable: { text: message.text },
      },
    ]);

    return record?.sequence ?? null;
  });

  link.registerOperation('createTask', z.object({ brief: z.string() }), (task) =>
    createTask(context, task.brief),
  );

  link.registerOperation('finishTask', z.object({ taskID: z.string() }), async (task) => {
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

  // closes the descriptor that holds the writer lock without stopping nixie, as a bug would, so
  // another process takes the lock while this one still writes
  link.registerOperation('releaseWriterLock', z.null(), () => {
    removeLockDescriptor(context.log.writer.dataDir);

    return null;
  });
}

// the writer lock is a flock on the data directory itself, so its descriptor names the directory
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
