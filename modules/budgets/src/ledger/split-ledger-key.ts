export interface LedgerKeyColumns {
  readonly counter: string;
  readonly unit: string;
  readonly kind: string;
  readonly start: string;
}

// The columns of a ledger key, which the budget ledger key joins with '|'.
export function splitLedgerKey(ledgerKey: string): LedgerKeyColumns {
  const [counter = '', unit = '', kind = '', start = ''] = ledgerKey.split('|');

  return { counter, unit, kind, start };
}
