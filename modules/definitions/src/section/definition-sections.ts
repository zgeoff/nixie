import type { JSONObject } from '@heynixie/log';

// A fault in one file of a section, which never refuses the seed.
export interface SectionProblem {
  readonly path: string;
  readonly reason: string;
}

export interface ParsedSection {
  // null when no file of the section holds a setting
  readonly value: unknown;
  readonly problems: readonly SectionProblem[];

  // the files that the parse applied
  readonly paths: ReadonlySet<string>;
}

// A folder of the definitions that a feature reads, and the settings it keeps in the snapshot. A
// feature that is off adds none, and its folder is then no definitions folder.
export interface DefinitionSection {
  // where the section's value sits in the stored form
  readonly key: string;
  readonly folder: string;

  // the first definitions format that reads the folder
  readonly minFormat: number;

  // the log event that reports each file the parse left unapplied
  readonly problemEvent: string;

  // Never throws: a file that fails counts as absent, and its fault goes in `problems`.
  readonly parse: (texts: ReadonlyMap<string, string>) => ParsedSection;
  readonly toForm: (value: unknown) => JSONObject;

  // reads the section's value back from the stored form, or null when it holds none
  readonly parseForm: (form: unknown) => unknown;
}

let added: readonly DefinitionSection[] = [];

// The server sets the list at the start of each server, before any part starts. A feature that is
// off adds none.
export const definitionSections = {
  set: (sections: readonly DefinitionSection[]): void => {
    added = sections;
  },
  list: (): readonly DefinitionSection[] => added,
};
