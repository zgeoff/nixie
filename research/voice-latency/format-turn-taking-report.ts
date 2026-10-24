import type { TurnTakingRecord } from './turn-taking-record.ts';

// A markdown table per candidate and speech set: the share of utterances the candidate started to
// speak over before their last speech ended, and its wait after the last speech for the rest.
export function formatTurnTakingReport(records: TurnTakingRecord[]): string {
  const keys = [...new Set(records.map((record) => `${record.candidate}\u0000${record.set}`))];
  const rows = keys.map((key) => {
    const [candidate = '', set = ''] = key.split('\u0000');
    const turns = records.filter((record) => record.candidate === candidate && record.set === set);
    const failed = turns.filter((turn) => turn.error !== undefined).length;
    const answered = turns.flatMap((turn) =>
      turn.error === undefined && turn.firstSoundMs !== undefined ? [{ ...turn, firstSoundMs: turn.firstSoundMs }] : [],
    );
    const silent = turns.length - failed - answered.length;
    const cutOff = answered.filter((turn) => turn.firstSoundMs < turn.lastSpeechMs).length;
    const waits = answered
      .filter((turn) => turn.firstSoundMs >= turn.lastSpeechMs)
      .map((turn) => turn.firstSoundMs - turn.lastSpeechMs);
    const heard = turns.length - failed;
    return [
      candidate,
      set,
      String(turns.length),
      `${cutOff} (${((heard === 0 ? 0 : cutOff / heard) * 100).toFixed(1)}%)`,
      formatPercentiles(waits),
      String(silent),
      String(failed),
    ];
  });
  return [
    '| Candidate | Speech | Utterances | Spoke before the last speech ended | Wait after the last speech, median / p90 | Never replied | Failed |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function formatPercentiles(values: number[]): string {
  if (values.length === 0) {
    return '-';
  }
  const sorted = values.toSorted((first, second) => first - second);
  const at = (share: number): number => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0);
  return `${at(0.5)} / ${at(0.9)} ms`;
}
