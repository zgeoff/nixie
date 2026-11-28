import type { StatusEvent } from '@heynixie/connections';
import { formatEventTime } from '@heynixie/sessions';
import { connectionStatusText } from './connection-status-text';
import { fillStatusText } from './fill-status-text';
import { renderConnectionAccount } from './render-connection-account';
import { renderLastSuccess } from './render-last-success';
import { renderRemovedTools } from './render-removed-tools';

// One line of the events block about a connection. The block puts the time of the event before the
// line, so the line holds only the times of other moments.
export function renderConnectionEvent(event: StatusEvent, timeZone: string): string {
  const named = {
    connector: event.who.connector,
    label: event.who.label,
    account: renderConnectionAccount(event.who.account),
  };

  if (event.kind === 'changed') {
    return fillStatusText(connectionStatusText.changedLine, {
      ...named,
      status: connectionStatusText.statusNames[event.status],
      reason: event.reason === null ? '' : ` (${event.reason})`,
      lastSuccess: renderLastSuccess(event.lastSuccessAtMs, timeZone),
      removed: renderRemovedTools(event.removedTools),
      place: connectionStatusText.reconnectPlace,
    });
  }

  if (event.kind === 'returned') {
    return fillStatusText(connectionStatusText.returnedLine, {
      ...named,
      failed: renderFailedCalls(event.failedCalls),
      runs: renderRunsWithout(event.skippedRuns),
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

function renderRunsWithout(count: number): string {
  if (count === 0) {
    return '';
  }

  return count === 1
    ? connectionStatusText.oneRunWithout
    : fillStatusText(connectionStatusText.manyRunsWithout, { count: String(count) });
}
