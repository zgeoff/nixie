import type { SecretsEntryName } from '../file/secrets-entry-names';

export interface OwnValueEntry {
  readonly group: SecretsEntryName;
  readonly name: string;
  readonly value: string;

  // joins every scan, whatever the scan's entry filter leaves out
  readonly isAlways?: boolean;
}

export interface OwnValueFilter {
  // the entries a scan keeps; absent, every entry but the private settings
  readonly entries?: readonly SecretsEntryName[];
  readonly minChars: number;
}

// The one live set of values nixie holds as its own. A backend adds a value when it loads or
// changes it, and a scan reads the set at the moment it runs, never at start.
export interface OwnValueSet {
  readonly add: (entry: OwnValueEntry) => void;
  readonly remove: (group: SecretsEntryName, name: string) => void;
  readonly read: (filter: OwnValueFilter) => readonly string[];
}

export function createOwnValueSet(): OwnValueSet {
  const entries = new Map<string, OwnValueEntry>();

  return {
    add: (entry) => {
      entries.set(`${entry.group}\n${entry.name}`, entry);
    },
    remove: (group, name) => {
      entries.delete(`${group}\n${name}`);
    },
    read: (filter) => {
      const kept = [...entries.values()].filter((entry) => isKept(entry, filter));

      return [...new Set(kept.map((entry) => entry.value))];
    },
  };
}

function isKept(entry: OwnValueEntry, filter: OwnValueFilter): boolean {
  if (entry.value.length < filter.minChars) {
    return false;
  }

  if (entry.isAlways === true) {
    return true;
  }

  return filter.entries === undefined
    ? entry.group !== 'settings'
    : filter.entries.includes(entry.group);
}
