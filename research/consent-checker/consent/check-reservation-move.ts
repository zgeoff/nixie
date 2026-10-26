export type ReservationState = 'reserved' | 'settled';

// A reservation starts reserved, and a settlement or the record of its call settles it once. A rerun
// of a settled call writes a new reservation rather than moving the settled one.
const reservationMoves: Readonly<Record<ReservationState, readonly ReservationState[]>> = {
  reserved: ['settled'],
  settled: [],
};

export function checkReservationMove(
  key: string,
  from: ReservationState,
  to: ReservationState,
): void {
  if (!reservationMoves[from].includes(to)) {
    throw new Error(`the reservation for ${key} cannot move from ${from} to ${to}`);
  }
}
