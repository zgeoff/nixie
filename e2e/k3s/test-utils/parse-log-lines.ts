// One line of nixie's JSON log: the time and the event lead it, and envelope fields follow.
export interface LogLine {
  readonly time: Date;
  readonly event: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

// Parses the JSON lines of nixie's log, as kubectl logs prints them, and skips any line that is no
// log line, such as a message kubectl adds when a stream ends.
export function parseLogLines(text: string): readonly LogLine[] {
  return text.split('\n').flatMap((line) => parseLogLine(line) ?? []);
}

function parseLogLine(line: string): LogLine | null {
  const parsed = parseJSON(line);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const fields: Readonly<Record<string, unknown>> = Object.fromEntries(Object.entries(parsed));
  const time = fields['time'];
  const event = fields['event'];

  if (typeof time !== 'string' || typeof event !== 'string' || Number.isNaN(Date.parse(time))) {
    return null;
  }
  return { time: new Date(time), event, fields };
}

function parseJSON(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
