import type { StatusEvent } from '@heynixie/connections';
import { formatEventTime } from '@heynixie/sessions';
import { connectionStatusText } from './connection-status-text';
import { fillStatusText } from './fill-status-text';

// One line of the events block about a connection.
export function renderConnectionEvent(event: StatusEvent, timeZone: string): string {
  const named = {
    connector: event.who.connector,
    label: event.who.label,
    account: event.who.account,
    at: formatEventTime(event.atMs, timeZone),
  };

  if (event.kind === 'changed') {
    return fillStatusText(connectionStatusText.changedLine, {
      ...named,
      status: connectionStatusText.statusNames[event.status],
      reason: event.reason === null ? '' : ` (${event.reason})`,
    });
  }

  if (event.kind === 'returned') {
    return fillStatusText(connectionStatusText.returnedLine, {
      ...named,
      failed: renderFailedCalls(event.failedCalls),
    });
  }

  return fillStatusText(connectionStatusText.lastedLine, {
    ...named,
    since: formatEventTime(event.sinceMs, timeZone),
  });
}

function renderFailedCalls(count: number): string {
  if (count === 0) {
    return connectionStatusText.noCallFailed;
  }

  return count === 1
    ? connectionStatusText.oneCallFailed
    : fillStatusText(connectionStatusText.manyCallsFailed, { count: String(count) });
}
