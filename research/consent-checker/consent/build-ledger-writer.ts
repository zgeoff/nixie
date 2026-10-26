import type { ReservationState } from './check-reservation-move.ts';
import { checkReservationMove } from './check-reservation-move.ts';
import type { Reservation, Settlement } from './types.ts';

export interface LedgerWriter<Settled> {
  appendReservation: (reservation: Reservation) => Promise<void>;
  appendSettlement: (settlement: Settlement) => Promise<void>;
  appendRecord: (record: Settled) => Promise<void>;
}

export interface LedgerWriterInput<Settled> {
  open: readonly Reservation[];
  keyOf: (record: Settled) => string;
  appendLine: (line: Reservation | Settlement | Settled) => Promise<void>;
}

// The label and check runs append to their output file only through this writer, so each line moves
// its call's reservation only as the transition table allows before the line is appended.
export function buildLedgerWriter<Settled>(
  input: LedgerWriterInput<Settled>,
): LedgerWriter<Settled> {
  const states = new Map<string, ReservationState>(
    input.open.map((reservation) => [reservation.reservedFor, 'reserved']),
  );

  const settle = (key: string): void => {
    const from = states.get(key);

    if (from === undefined) {
      throw new Error(`the reservation for ${key} cannot settle, because no reservation holds it`);
    }

    checkReservationMove(key, from, 'settled');

    states.set(key, 'settled');
  };

  return {
    appendReservation: async (reservation) => {
      const from = states.get(reservation.reservedFor);

      if (from === 'reserved') {
        checkReservationMove(reservation.reservedFor, from, 'reserved');
      }

      states.set(reservation.reservedFor, 'reserved');

      await input.appendLine(reservation);
    },
    appendSettlement: async (settlement) => {
      settle(settlement.settledFor);

      await input.appendLine(settlement);
    },
    appendRecord: async (record) => {
      settle(input.keyOf(record));

      await input.appendLine(record);
    },
  };
}
