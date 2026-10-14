import type { MessageTimeOptions, SessionStart } from './types';

// What every status entry reads from: the start, when the session opened, how a time renders, and
// the model from the conversation's profile.
export interface SessionFacts {
  readonly start: SessionStart;
  readonly openedAt: Date;
  readonly times: MessageTimeOptions;
  readonly model: string;
}

// One line of a new session's status: its value, a name, a time or a count that the opening record
// keeps, and the line the model reads.
export interface StatusLine {
  readonly value: string | number;
  readonly text: string;
}

// One entry of the status registry, which a package owns: its name and how it reads its line when
// a session opens.
export interface StatusEntry {
  readonly name: string;
  readonly read: (facts: SessionFacts) => Promise<StatusLine>;
}

export type StatusRegistry = readonly StatusEntry[];

// Builds the registry a new session's status reads from a list of entries, in the order the status
// shows them, so a new line is one more entry and no change to the opening. It refuses two entries
// with one name, because the opening record keys each value by its entry's name.
export function buildStatusRegistry(entries: readonly StatusEntry[]): StatusRegistry {
  const names = entries.map((entry) => entry.name);
  const repeated = names.find((name, index) => names.indexOf(name) !== index);

  if (repeated !== undefined) {
    throw new Error(`the status has two entries named ${repeated}`);
  }
  return entries;
}
