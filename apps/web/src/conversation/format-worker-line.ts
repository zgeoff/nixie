import { formatTokenCount } from './format-token-count';
import type { WorkerActivity, WorkerUsed } from './worker-activity';

// The collapsed line of a worker run: its short ID, the start of its question, its outcome and what
// it used. A run with no end shows as running, with the turns and dollars so far.
export function formatWorkerLine(worker: WorkerActivity, question: string | undefined): string {
  const parts = [
    worker.shortID === undefined ? 'worker' : `worker ${worker.shortID}`,
    ...(question === undefined ? [] : [formatQuestionStart(question)]),
    ...(worker.end === undefined
      ? ['running', ...formatRunningUsage(worker)]
      : [worker.end.outcome, ...formatUsed(worker.end.used)]),
  ];

  return parts.join(' · ');
}

const questionLimit = 60;

function formatQuestionStart(question: string): string {
  const oneLine = question.replaceAll(/\s+/gu, ' ').trim();

  return oneLine.length > questionLimit ? `${oneLine.slice(0, questionLimit)}…` : oneLine;
}

function formatRunningUsage(worker: WorkerActivity): readonly string[] {
  const dollars = worker.turns.reduce((sum, turn) => sum + turn.dollars, 0);

  return [formatTurns(worker.turns.length), formatDollars(dollars)];
}

function formatTurns(turns: number): string {
  return turns === 1 ? '1 turn' : `${turns} turns`;
}

function formatDollars(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

function formatUsed(used: WorkerUsed): readonly string[] {
  return [
    `${used.minutes.toFixed(1)} min`,
    formatTurns(used.turns),
    `${formatTokenCount(used.tokens)} tokens`,
    formatDollars(used.dollars),
  ];
}
