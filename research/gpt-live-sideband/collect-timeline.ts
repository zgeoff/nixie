// Turns a probe log into timeline lines. Times are ms since the first entry, by arrival; session
// times in brackets are GPT-Live's own session timeline.
export interface TimelineEntry {
  connection: string;
  event: Record<string, unknown>;
  receivedAtMs: number;
}

const loudPeak = 0.02;
const transcriptTypes = new Set(['session.input_transcript.delta', 'session.output_transcript.delta']);
const audioTypes = new Set(['session.output_audio.delta', 'session.input_audio.append']);
const omittedFields = new Set(['instructions', 'event_id']);

export function collectTimeline(entries: readonly TimelineEntry[]): string[] {
  const firstMs = entries[0]?.receivedAtMs ?? 0;
  const lines: string[] = [];
  let run: { connection: string; endMs: number; startMs: number; text: string; type: string; atMs: number } | undefined;
  let loud: { endMs: number; startMs: number; atMs: number } | undefined;
  const flushRun = (): void => {
    if (run) {
      const who = run.type === 'session.input_transcript.delta' ? 'heard' : 'said';
      lines.push(`${run.atMs - firstMs} ${run.connection} ${who} [${run.startMs}-${run.endMs}] ${JSON.stringify(run.text)}`);
      run = undefined;
    }
  };
  const flushLoud = (): void => {
    if (loud) {
      lines.push(`${loud.atMs - firstMs} sideband output audio [${loud.startMs}-${loud.endMs}]`);
      loud = undefined;
    }
  };
  for (const entry of entries) {
    const type = String(entry.event.type);
    if (transcriptTypes.has(type)) {
      const startMs = Number(entry.event.start_ms);
      const endMs = Number(entry.event.end_ms);
      if (!run || run.type !== type || run.connection !== entry.connection) {
        flushRun();
        run = { atMs: entry.receivedAtMs, connection: entry.connection, endMs, startMs, text: '', type };
      }
      run.text += String(entry.event.delta);
      run.endMs = endMs;
      continue;
    }
    if (audioTypes.has(type)) {
      if (type === 'session.output_audio.delta' && Number(entry.event.peak) >= loudPeak) {
        const startMs = Number(entry.event.start_ms);
        const endMs = Number(entry.event.end_ms);
        if (loud && startMs - loud.endMs <= 300) {
          loud.endMs = endMs;
        } else {
          flushLoud();
          loud = { atMs: entry.receivedAtMs, endMs, startMs };
        }
      }
      continue;
    }
    flushRun();
    flushLoud();
    const shown = Object.fromEntries(Object.entries(entry.event).filter(([field]) => !omittedFields.has(field)));
    lines.push(`${entry.receivedAtMs - firstMs} ${entry.connection} ${JSON.stringify(shown)}`);
  }
  flushRun();
  flushLoud();
  return lines;
}
