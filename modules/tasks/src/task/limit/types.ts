export interface RaisedSandboxLimit {
  readonly sandbox: string;

  // the sandbox's count at its last read, in whole micros
  readonly countMicros: number;

  // how many reads the task run held, which a newer read outdates
  readonly readCount: number;

  // what the raised piece of work may still spend: its new totals less what it used since its newest
  // restart, as the task run that the raise carries holds
  // Infinity when the raised piece of work has no dollar limit
  readonly leftDollars: number;
}
