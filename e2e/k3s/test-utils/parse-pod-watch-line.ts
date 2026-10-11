// One event from `kubectl get pod --watch --output-watch-events` with the pod watch template: the
// event type, the pod's UID, and, once the nixie container has ended, its exit code and end time.
export interface PodWatchEvent {
  readonly type: string;
  readonly uid: string;
  readonly exitCode: number | null;
  readonly finishedAt: Date | null;
}

// the jsonpath template whose lines this parser reads, one line per watch event
export const podWatchTemplate = [
  '{.type}',
  '{.object.metadata.uid}',
  '{.object.status.containerStatuses[?(@.name=="nixie")].state.terminated.exitCode}',
  '{.object.status.containerStatuses[?(@.name=="nixie")].state.terminated.finishedAt}',
].join('|');

// Parses one line of the pod watch, and answers null for a line in any other shape.
export function parsePodWatchLine(line: string): PodWatchEvent | null {
  const [type = '', uid = '', exitCode = '', finishedAt = '', ...rest] = line.trim().split('|');

  if (type === '' || uid === '' || rest.length > 0) {
    return null;
  }
  return {
    type,
    uid,
    exitCode: /^\d+$/u.test(exitCode) ? Number(exitCode) : null,
    finishedAt: Number.isNaN(Date.parse(finishedAt)) ? null : new Date(finishedAt),
  };
}
