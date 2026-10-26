import { buildLabels } from './build-labels.ts';
import { buildLedger } from './build-ledger.ts';
import { ledgerKeys } from './ledger-keys.ts';
import type { Rate } from './score-verdicts.ts';
import { scoreVerdicts } from './score-verdicts.ts';
import type { CheckLine, ConsentCase, LabelLine } from './types.ts';

export interface ScoreInput {
  cases: readonly ConsentCase[];
  labelLines: readonly LabelLine[];
  checkLines: readonly CheckLine[];
}

export function renderScoreReport(input: ScoreInput): string {
  const labelLedger = buildLedger(input.labelLines, ledgerKeys.label);
  const labelRecords = labelLedger.records;
  const built = buildLabels(labelRecords);
  const labels = built.labels;
  const checkLedger = buildLedger(input.checkLines, ledgerKeys.check);
  const allChecks = checkLedger.records;

  const caseIDs = new Set(input.cases.map((consentCase) => consentCase.caseID));

  // A check of a pair that a later build of the cases dropped still counts in the spend.
  const checks = allChecks.filter((record) => caseIDs.has(record.caseID));
  const score = scoreVerdicts(checks, labels);
  const labelSpend = labelLedger.spentUSD;
  const checkSpend = checkLedger.spentUSD;

  const lines = [
    `labeller: ${built.unsure} natural pairs unsure, ${labelRecords.filter((record) => record.failure !== null).length} failed turns`,
    `checks of pairs outside the cases: ${allChecks.length - checks.length}`,
  ];

  for (const bucket of score.buckets) {
    lines.push(
      `${bucket.bucket}: asked ${bucket.asked}, not asked ${bucket.notAsked}, unlabelled ${bucket.unlabelled}, failed checks ${bucket.failed}`,
      `  miss rate ${formatRate(bucket.missed)}`,
      `  wrong-credit rate ${formatRate(bucket.wrongCredit)}`,
      `  credited ${formatRate(bucket.credited)}`,
    );
  }

  const natural = checks.filter((record) => record.bucket === 'natural');

  for (const tool of [...new Set(natural.map((record) => record.tool))].toSorted()) {
    const [byTool] = scoreVerdicts(
      natural.filter((record) => record.tool === tool),
      labels,
    ).buckets;

    if (byTool !== undefined) {
      lines.push(
        `natural ${tool}: miss ${formatRate(byTool.missed)}, wrong credit ${formatRate(byTool.wrongCredit)}`,
      );
    }
  }

  const swapped = checks.filter((record) => record.bucket === 'swapped');

  for (const tool of [...new Set(swapped.map((record) => record.tool))].toSorted()) {
    const byTool = scoreVerdicts(
      swapped.filter((record) => record.tool === tool),
      labels,
    ).buckets.find((bucket) => bucket.bucket === 'swapped');

    if (byTool !== undefined) {
      lines.push(`swapped ${tool}: credited ${formatRate(byTool.credited)}`);
    }
  }

  lines.push(
    `spend: labeller $${labelSpend.toFixed(4)}, checker $${checkSpend.toFixed(4)}, total $${(labelSpend + checkSpend).toFixed(4)}`,
  );

  return lines.join('\n');
}

function formatRate(rate: Rate): string {
  const share = rate.rate === null ? 'none' : rate.rate.toFixed(3);

  return `${share} (${rate.count} of ${rate.of}, 95% interval ${rate.low.toFixed(3)} to ${rate.high.toFixed(3)})`;
}
