import type { InboxKind } from '@heynixie/tasks';
import { renderHandoverAsked } from './handover/render-handover-asked';
import { renderHandoverClosed } from './handover/render-handover-closed';
import { renderTakeoverEnded } from './takeover/render-takeover-ended';
import { renderTakeoverStarted } from './takeover/render-takeover-started';

// The inbox records of a take-over and a handover, which the server adds when the computer is on.
// A take-over start and an ask wake nothing, because the assistant reads them with its next input.
// A close wakes only when the ask lapsed.
export const computerInboxKinds: readonly InboxKind[] = [
  { kind: 'computer.takeover_started', wakes: () => false, render: renderTakeoverStarted },
  { kind: 'computer.takeover_ended', wakes: () => true, render: renderTakeoverEnded },
  { kind: 'computer.handover_asked', wakes: () => false, render: renderHandoverAsked },
  {
    kind: 'computer.handover_closed',
    wakes: (payload) => payload['by'] === 'expired',
    render: renderHandoverClosed,
  },
];
