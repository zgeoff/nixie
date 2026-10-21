import type { MessageTimeOptions, SessionStart } from './types';

export interface SessionFacts {
  readonly start: SessionStart;
  readonly openedAt: Date;

  readonly zone?: string | null;
  readonly times: MessageTimeOptions;
  readonly model: string;
}

export interface StatusLine {
  readonly value: string | number;
  readonly text: string;
}

export interface StatusEntry {
  readonly name: string;
  readonly read: (facts: SessionFacts) => Promise<StatusLine>;
}

export type StatusRegistry = readonly StatusEntry[];

export function buildStatusRegistry(entries: readonly StatusEntry[]): StatusRegistry {
  const names = entries.map((entry) => entry.name);
  const repeated = names.find((name, index) => names.indexOf(name) !== index);

  if (repeated !== undefined) {
    throw new Error(`the status has two entries named ${repeated}`);
  }

  return entries;
}
