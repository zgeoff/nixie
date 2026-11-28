import type { AttentionConnection } from '@heynixie/connections';
import { formatEventTime } from '@heynixie/sessions';
import { connectionStatusText } from './connection-status-text';
import { fillStatusText } from './fill-status-text';

export interface ModelCredentialExpiry {
  readonly expiresAtMs: number;
}

export interface ConnectionStatusFacts {
  readonly connections: readonly AttentionConnection[];

  // an expiring model credential joins the entry of the conversation; a job run's entry has none
  readonly modelCredential: ModelCredentialExpiry | null;
  readonly timeZone: string;
}

// The status entry: each connection that needs attention, then the rule that says when to raise it.
// It renders nothing, an empty text, while every connection and the model credential work.
export function renderConnectionStatus(facts: ConnectionStatusFacts): string {
  const lines = facts.connections.map((connection) => renderStatusLine(connection, facts.timeZone));

  const credential =
    facts.modelCredential === null
      ? []
      : [
          fillStatusText(connectionStatusText.modelCredentialLine, {
            endsAt: formatEventTime(facts.modelCredential.expiresAtMs, facts.timeZone),
            place: connectionStatusText.reconnectPlace,
          }),
        ];

  const all = [...lines, ...credential];

  return all.length === 0
    ? ''
    : [connectionStatusText.statusIntro, ...all, connectionStatusText.statusRule].join('\n');
}

function renderStatusLine(connection: AttentionConnection, timeZone: string): string {
  return fillStatusText(connectionStatusText.statusLine, {
    connector: connection.connector,
    label: connection.label,
    account: connection.account,
    status: connectionStatusText.statusNames[connection.status],
    reason: connection.reason === null ? '' : ` (${connection.reason})`,
    since: formatEventTime(connection.sinceMs, timeZone),
    lastSuccess:
      connection.lastSuccessAtMs === null
        ? connectionStatusText.noSuccess
        : formatEventTime(connection.lastSuccessAtMs, timeZone),
    removed: renderRemovedTools(connection.removedTools),
    place: connectionStatusText.reconnectPlace,
  });
}

const shownToolCount = 5;

function renderRemovedTools(tools: readonly string[]): string {
  if (tools.length === 0) {
    return '';
  }

  const shown = tools.slice(0, shownToolCount).join(', ');
  const rest = tools.length - shownToolCount;

  return rest > 0
    ? fillStatusText(connectionStatusText.removedToolsMore, { tools: shown, count: String(rest) })
    : fillStatusText(connectionStatusText.removedTools, { tools: shown });
}
