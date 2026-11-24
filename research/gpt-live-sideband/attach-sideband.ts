// The server's sideband: a WebSocket attached to a running session. It logs every event it gets,
// with audio reduced to its timing and loudness, and dedupes the replay that opens each attach.
import { z } from 'zod';

export interface LogEntry {
  event: Record<string, unknown>;
  receivedAtMs: number;
}

export interface Sideband {
  // Sends session.close and waits for session.closed, or the watchdog.
  close: () => Promise<Record<string, unknown> | undefined>;
  log: LogEntry[];
  send: (event: Record<string, unknown>) => void;
  // Resolves with the first wanted event at or after fromIndex in the log, or undefined on timeout.
  waitFor: (
    isWanted: (event: Record<string, unknown>) => boolean,
    timeoutMs: number,
    fromIndex?: number,
  ) => Promise<LogEntry | undefined>;
}

const anyEvent = z.record(z.string(), z.unknown());
const audioEvent = z.object({
  delta: z.string().optional(),
  audio: z.string().optional(),
  end_ms: z.number().optional(),
  start_ms: z.number().optional(),
  type: z.enum(['session.output_audio.delta', 'session.input_audio.append']),
});

const closeWatchdogMs = 15_000;

export function attachSideband(key: string, sessionID: string): Promise<Sideband> {
  const socket = new WebSocket(`wss://api.openai.com/v1/live/sessions/${sessionID}/attach`, {
    headers: { authorization: `Bearer ${key}` },
  });
  const log: LogEntry[] = [];
  const seenIDs = new Set<string>();
  const waiters = new Set<(entry: LogEntry) => void>();
  socket.addEventListener('message', (message) => {
    const event = toLoggedEvent(anyEvent.parse(JSON.parse(String(message.data))));
    if (typeof event.event_id === 'string') {
      if (seenIDs.has(event.event_id)) {
        return;
      }
      seenIDs.add(event.event_id);
    }
    const entry = { event, receivedAtMs: Date.now() };
    log.push(entry);
    for (const waiter of waiters) {
      waiter(entry);
    }
  });
  const send = (event: Record<string, unknown>): void => {
    log.push({ event: { ...event, sent: true }, receivedAtMs: Date.now() });
    socket.send(JSON.stringify(event));
  };
  const waitFor: Sideband['waitFor'] = (isWanted, timeoutMs, fromIndex = 0) => {
    const earlier = log.slice(fromIndex).find((entry) => entry.event.sent !== true && isWanted(entry.event));
    if (earlier) {
      return Promise.resolve(earlier);
    }
    return new Promise((resolve) => {
      const waiter = (entry: LogEntry): void => {
        if (isWanted(entry.event)) {
          waiters.delete(waiter);
          clearTimeout(timer);
          resolve(entry);
        }
      };
      const timer = setTimeout(() => {
        waiters.delete(waiter);
        resolve(undefined);
      }, timeoutMs);
      waiters.add(waiter);
    });
  };
  const close = async (): Promise<Record<string, unknown> | undefined> => {
    if (socket.readyState === WebSocket.OPEN) {
      send({ type: 'session.close' });
    }
    const closed = await waitFor((event) => event.type === 'session.closed', closeWatchdogMs);
    socket.close();
    return closed?.event;
  };
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve({ close, log, send, waitFor }));
    socket.addEventListener('error', () => reject(new Error(`sideband: attach to ${sessionID} failed`)));
  });
}

// Keeps an audio event's timing and its loudest sample, and drops the payload.
function toLoggedEvent(event: Record<string, unknown>): Record<string, unknown> {
  const audio = audioEvent.safeParse(event);
  if (!audio.success) {
    return event;
  }
  const { delta, audio: samples, ...rest } = audio.data;
  return { ...rest, peak: toPeak(delta ?? samples ?? '') };
}

function toPeak(pcmBase64: string): number {
  const bytes = Buffer.from(pcmBase64, 'base64');
  let peak = 0;
  for (let offset = 0; offset + 1 < bytes.length; offset += 2) {
    peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)));
  }
  return peak / 32768;
}
