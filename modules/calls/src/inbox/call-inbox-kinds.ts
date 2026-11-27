import type { LogRecord } from '@heynixie/log';
import type { InboxKind, TasksContext } from '@heynixie/tasks';
import { readHeardCut } from './read-heard-cut';
import { readSmallTalk } from './read-small-talk';
import { renderCallNotice } from './render-call-notice';
import type { CallThreadExtra } from './render-call-thread-line';
import { renderCallThreadLine } from './render-call-thread-line';

// The inbox records of a call, which the server adds when the voice section is set. The 3 notices go
// to the conversation. The hand-off, the cut and the closing marker go to the call's own thread, and
// a cut wakes nothing: the next hand-off reads it.
export const callInboxKinds: readonly InboxKind[] = [
  { kind: 'call.started', wakes: () => true, render: renderCallNotice },
  { kind: 'call.answered', wakes: () => true, render: renderCallNotice },
  { kind: 'call.ended', wakes: () => true, render: renderCallNotice },
  {
    kind: 'call.handed_off',
    wakes: () => true,
    read: readCallThreadExtra,
    render: renderCallThreadLine,
  },
  {
    kind: 'call.heard_cut',
    wakes: () => false,
    read: readCallThreadExtra,
    render: renderCallThreadLine,
  },
  {
    kind: 'call.closing',
    wakes: () => true,
    read: readCallThreadExtra,
    render: renderCallThreadLine,
  },
];

async function readCallThreadExtra(
  context: Pick<TasksContext, 'log'>,
  record: LogRecord,
): Promise<CallThreadExtra> {
  return {
    cut: await readHeardCut(context, record),
    smallTalk: await readSmallTalk(context, record),
  };
}
