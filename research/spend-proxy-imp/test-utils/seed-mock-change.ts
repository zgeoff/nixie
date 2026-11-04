// @boundaries-ignore a spike imports the code it measures
import { store } from '../../../apps/web/src/mocks/store.ts';

// One change the model makes on a real preview while the runner waits: the tasks it starts, then
// the records it writes, in order.
export interface MockChange {
  readonly tasks?: readonly { readonly taskID: string; readonly name: string }[];
  readonly records?: readonly {
    readonly kind: string;
    readonly thread?: string;
    readonly text?: string;
    readonly readCursor?: number;
  }[];
}

export async function seedMockChange(change: MockChange): Promise<void> {
  for (const task of change.tasks ?? []) {
    await store.tasks.create(task);
  }

  for (const record of change.records ?? []) {
    const thread = record.thread ?? 'conversation';

    await store.records.create({
      kind: record.kind,
      thread,
      ...(record.text === undefined ? {} : { message: { text: record.text } }),
      ...(record.readCursor === undefined
        ? {}
        : { task: { readCursor: record.readCursor, taskID: thread } }),
    });
  }
}
