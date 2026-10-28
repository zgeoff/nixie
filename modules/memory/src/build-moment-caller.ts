import type { ToolContext } from '@heynixie/tools';
import type { MomentCaller } from './moment-types';

// The thread and the model come from the task run, never from the tool's arguments, so a model
// keeps only its own thread and labels a reflection only with its own model ID.
export function buildMomentCaller(context: ToolContext): MomentCaller {
  return { kind: 'model', thread: context.run.thread, model: context.run.model.model };
}
