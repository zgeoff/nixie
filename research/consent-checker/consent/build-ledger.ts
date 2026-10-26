import type { Reservation, Settlement } from './types.ts';

export interface Ledger<Settled> {
  records: Settled[];
  spentUSD: number;
  open: Reservation[];
}

// A call's cost is recorded whether the call succeeds or fails, and its reservation, at least the most
// the call can cost, is written before the call. A known cost replaces its reservation; an unknown
// cost, a settlement, or a reservation that nothing settled counts the reserved amount.
export function buildLedger<Settled extends { costUSD: number | null }>(
  lines: readonly (Reservation | Settlement | Settled)[],
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

    if (isSettlement(line)) {
      open.delete(line.settledFor);

      spentUSD += line.settledUSD;
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

  return {
    records,
    spentUSD,
    open: Array.from(open, ([reservedFor, reserveUSD]) => ({ reservedFor, reserveUSD })),
  };
}

function isReservation<Settled>(line: Reservation | Settlement | Settled): line is Reservation {
  return typeof line === 'object' && line !== null && 'reservedFor' in line;
}

function isSettlement<Settled>(line: Settlement | Settled): line is Settlement {
  return typeof line === 'object' && line !== null && 'settledFor' in line;
}
