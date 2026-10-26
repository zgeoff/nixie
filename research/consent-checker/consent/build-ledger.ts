import type { Reservation } from './types.ts';

export interface Ledger<Settled> {
  records: Settled[];
  spentUSD: number;
}

// A call's cost is recorded whether the call succeeds or fails, and its reservation is written before
// the call, so a crash leaves the reservation as an estimate of the call's unknown cost. A known cost
// replaces its reservation; an unknown cost or a reservation that nothing settled counts in full.
export function buildLedger<Settled extends { costUSD: number | null }>(
  lines: readonly (Reservation | Settled)[],
  keyOf: (record: Settled) => string,
): Ledger<Settled> {
  const open = new Map<string, number>();

  const records: Settled[] = [];
  let spentUSD = 0;

  for (const line of lines) {
    if (isReservation(line)) {
      spentUSD += open.get(line.reservedFor) ?? 0;

      open.set(line.reservedFor, line.reserveUSD);
      continue;
    }

    const key = keyOf(line);
    const reserveUSD = open.get(key) ?? 0;

    open.delete(key);

    spentUSD += line.costUSD ?? reserveUSD;

    records.push(line);
  }

  for (const reserveUSD of open.values()) {
    spentUSD += reserveUSD;
  }

  return { records, spentUSD };
}

function isReservation<Settled>(line: Reservation | Settled): line is Reservation {
  return typeof line === 'object' && line !== null && 'reservedFor' in line;
}
