import type { TasksContext } from '@heynixie/tasks';
import {
  conversationTaskID,
  readToolHolders,
  writeThreadRecordInTransaction,
} from '@heynixie/tasks';
import type { OnPinMoved } from '../types';
import { buildToolChangeNote } from './build-tool-change-note';

// The pin-move callback that puts a change note in the inbox of the conversation and of every task
// whose open run holds the tool, in the transaction that moves the pin. A task that finished takes
// no input, and a run that opens later reads the new form anyway.
export function makeToolChangeNotifier(
  tasks: Pick<TasksContext, 'definitions' | 'log' | 'readDefinitionVersion'>,
): OnPinMoved {
  return async (tx, move) => {
    const probe = buildToolChangeNote(move, {
      definitions: tasks.definitions(),
      thread: conversationTaskID,
    });

    if (probe === null) {
      return;
    }

    const holders = await readToolHolders(tx, tasks, move.tool);

    for (const thread of [conversationTaskID, ...holders]) {
      const note = buildToolChangeNote(move, { definitions: tasks.definitions(), thread });

      if (note !== null) {
        await writeThreadRecordInTransaction(tx, tasks, note);
      }
    }
  };
}
