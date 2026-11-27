import type { LogRecord } from '@heynixie/log';
import type { InboxRenderContext } from '@heynixie/tasks';
import { capitalizeFirst, renderSystemMessage } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { callAnsweredCodec } from '../record/call-answered-codec';
import { callStartedCodec } from '../record/call-started-codec';
import { callEndedCodec } from '../utils/call-ended-codec';

// What the conversation reads when a call opens, is answered or ends, in the owner's name, or "the
// user" when none is set. The call runs on a thread of its own, so the notice tells the model that
// task.message briefs it and that the conversation may end the turn silently.
export function renderCallNotice(record: LogRecord, context: InboxRenderContext): string {
  const name = context.ownerName ?? 'the user';

  const body = match(record.kind)
    .with('call.started', () => {
      const started = callStartedCodec.decode(record.payload);

      return started.startedBy === 'you'
        ? `[#${started.callID}] ${capitalizeFirst(name)} started a call. It runs in its own thread, task ${started.taskID}: brief it with task.message, or end this turn silently.`
        : `[#${started.callID}] You rang ${name}. The call runs in its own thread, task ${started.taskID}.`;
    })
    .with('call.answered', () => {
      const answered = callAnsweredCodec.decode(record.payload);

      return `[#${answered.callID}] ${capitalizeFirst(name)} answered the call.`;
    })
    .with('call.ended', () => {
      const ended = callEndedCodec.decode(record.payload);

      return `[#${ended.callID}] The call ended ${renderEndedBy(ended.endedBy, name)}, after ${String(ended.minutes)} min. Its summary follows as a task report when it has one.`;
    })
    .otherwise((kind) => {
      throw new Error(`${kind} is no call notice`);
    });

  return renderSystemMessage({
    type: 'call',
    at: context.at,
    body,
  });
}

function renderEndedBy(endedBy: ReturnType<typeof callEndedCodec.decode>['endedBy'], name: string) {
  return match(endedBy)
    .with('you', () => `when ${name} hung up`)
    .with('nixie', () => 'when you hung up')
    .with('budget', () => 'because the call budget ran out')
    .with('missed', () => `because ${name} did not answer`)
    .with('declined', () => `because ${name} declined`)
    .with('dropped', () => 'because the connection dropped')
    .exhaustive();
}
