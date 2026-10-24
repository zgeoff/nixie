import type { ReplyRecord } from './reply-record.ts';

// The pass criteria agreed for the spike: the first audio at a median of 1.5 s or less from the
// end of speech, and a gap mid-reply in fewer than 5% of turns.
const firstAudioGateMs = 1500;
const gapShareGate = 0.05;

// A markdown table with one row per candidate, in the order the candidates first appear.
export function formatReplyReport(records: ReplyRecord[]): string {
  const candidates = [...new Set(records.map((record) => record.candidate))];
  const rows = candidates.map((candidate) => {
    const turns = records.filter((record) => record.candidate === candidate);
    const played = turns.filter((turn) => !turn.isError && turn.firstAudioMs !== undefined);
    const firstAudio = played.flatMap((turn) => (turn.firstAudioMs === undefined ? [] : [turn.firstAudioMs]));
    const fullAudio = played.flatMap((turn) => (turn.fullAudioMs === undefined ? [] : [turn.fullAudioMs]));
    const gapped = played.filter((turn) => turn.gaps > 0).length;
    const toolTurns = turns.filter((turn) => turn.needsTool);
    const toolUsed = toolTurns.filter((turn) => turn.toolCalls.length > 0).length;
    const costUSD = turns.reduce((sum, turn) => sum + turn.costUSD, 0);
    const minutes = turns.reduce((sum, turn) => sum + (turn.speechMs + turn.playEndMs) / 60_000, 0);
    const firstMedian = findPercentile(firstAudio, 0.5);
    const gapShare = played.length === 0 ? 1 : gapped / played.length;
    const passes = firstMedian !== undefined && firstMedian <= firstAudioGateMs && gapShare < gapShareGate;
    return [
      candidate,
      String(turns.length),
      formatPercentiles(firstAudio),
      formatPercentiles(fullAudio),
      `${gapped} (${(gapShare * 100).toFixed(1)}%)`,
      `${toolUsed} of ${toolTurns.length}`,
      `$${(costUSD / Math.max(1, turns.length)).toFixed(4)}`,
      `$${(minutes === 0 ? 0 : costUSD / minutes).toFixed(4)}`,
      String(turns.length - played.length),
      passes ? 'yes' : 'no',
    ];
  });
  return [
    '| Candidate | Turns | First audio, median / p90 | Full answer audio, median / p90 | Turns with a gap | Tool called when needed | Cost per turn | Cost per minute | Failed | Passes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function formatPercentiles(values: number[]): string {
  const median = findPercentile(values, 0.5);
  const p90 = findPercentile(values, 0.9);
  return median === undefined || p90 === undefined ? '-' : `${formatSeconds(median)} / ${formatSeconds(p90)}`;
}

function findPercentile(values: number[], share: number): number | undefined {
  const sorted = values.toSorted((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}
