import type { HealthReport } from './types';

export interface DefaultLabelOptions {
  readonly connectorID: string;

  readonly report: HealthReport;

  readonly takenLabels: readonly string[];
}

export function pickDefaultLabel(options: DefaultLabelOptions): string {
  const accountName = options.report.accountName?.trim() ?? '';
  const label = accountName === '' ? options.connectorID : accountName;

  const taken = new Set(options.takenLabels.map((held) => normalizeLabel(held)));

  if (!taken.has(normalizeLabel(label))) {
    return label;
  }

  let number = 2;

  while (taken.has(normalizeLabel(`${label} ${number}`))) {
    number += 1;
  }

  return `${label} ${number}`;
}

function normalizeLabel(label: string): string {
  return label.trim().normalize('NFC').toLowerCase();
}
