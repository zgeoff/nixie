import { conversationTaskID } from '@heynixie/tasks';
import type { ToolContext } from '@heynixie/tools';
import type { NoteWriter } from '../types';

// The writer and the model come from the run, never from a tool's input: the conversation, or the
// task whose run called the tool.
export function buildNotebookCaller(context: ToolContext): NoteWriter {
  return {
    writer: context.run.thread === conversationTaskID ? 'conversation' : context.run.thread,
    model: context.run.model.model,
  };
}
