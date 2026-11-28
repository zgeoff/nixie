export interface ForgetCoverage {
  readonly keyIDs: ReadonlySet<string>;
  readonly families: readonly string[];
  readonly threads: ReadonlySet<string>;
}

export type ExportTextStatus = 'none' | 'readable' | 'shredded' | 'expired' | 'unreadable';
