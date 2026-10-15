import type { HealthReport } from './types';

export interface DefaultLabelOptions {
  // the connector of the new connection, such as 'google'
  readonly connectorID: string;

  // the report of the check that ran when the connection was set up
  readonly report: HealthReport;

  // the labels the connector's other connections hold
  readonly takenLabels: readonly string[];
}

// Picks a new connection's label: the account name its check reported, trimmed, or the connector's
// ID when the check reported none. When another connection of the connector holds that label, it
// adds the lowest free number from 2, so 2 connections of one connector never share a label.
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

// Labels compare after trimming, in Unicode NFC and ignoring case.
function normalizeLabel(label: string): string {
  return label.trim().normalize('NFC').toLowerCase();
}
