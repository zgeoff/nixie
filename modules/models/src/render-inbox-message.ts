import type { LogRecord } from '@heynixie/log';

// Renders an inbox record as the text the model reads: your message as you wrote it, and a short
// line for a fired timer or an action's outcome. A message whose text was forgotten keeps its place
// with a note, so the model never reads a gap as silence.
export function renderInboxMessage(record: LogRecord): string {
  switch (record.kind) {
    case 'owner_message': {
      return renderOwnerMessage(record);
    }
    case 'timer.fired': {
      return `A timer fired: ${JSON.stringify(record.payload)}`;
    }
    case 'action.outcome': {
      return `An action settled: ${JSON.stringify(record.payload)}`;
    }
    default: {
      return `A ${record.kind} record arrived: ${JSON.stringify(record.payload)}`;
    }
  }
}

function renderOwnerMessage(record: LogRecord): string {
  const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

  return typeof text === 'string' ? text : '[a message you sent, since forgotten]';
}
