import type { TaskInputEvent } from '@heynixie/triggers';
import type { Binding, SessionEvent, WakeEvent } from '../types';

// The events of the bound sessions, for each task's thread; the adapter reaches sessions nixie does
// not work with, so the rest are dropped. An event wakes the task when it is the session's end, an
// answer to a note, or a state or a note's label that the wake set holds.
export function collectTaskInputs(
  events: readonly SessionEvent[],
  bindings: ReadonlyMap<string, Binding>,
): TaskInputEvent[] {
  return events.flatMap((event) => {
    const binding = bindings.get(event.session);

    if (binding === undefined || binding.unboundAt !== null) {
      return [];
    }

    return [
      {
        kind: 'task_input',
        taskID: binding.taskID,
        dedupeKey: event.eventKey,
        occurredAt: event.at,
        hop: binding.hop,
        wake: isWaking(event, binding.wake),
        facts: buildFacts(event),
        payload: { ...event },
      },
    ];
  });
}

function isWaking(event: SessionEvent, wake: readonly WakeEvent[]): boolean {
  if (event.kind === 'answered' || event.kind === 'unanswered') {
    return true;
  }

  if (event.kind === 'note') {
    return wake.includes(event.label);
  }

  return event.state === 'ended' || (event.state !== 'running' && wake.includes(event.state));
}

// The facts are no text of a person's, so the record keeps them outside its erasable fields.
function buildFacts(event: SessionEvent): TaskInputEvent['facts'] {
  if (event.kind === 'state') {
    return { kind: 'state', state: event.state };
  }

  return event.kind === 'note'
    ? { kind: 'note', label: event.label }
    : { kind: event.kind, messageRef: event.messageRef };
}
