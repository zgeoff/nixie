export interface ForgettableInput {
  readonly task_id: string;
  readonly intake_sequence: number;
}

export interface ForgetScope {
  // every request on these threads goes
  readonly threads: readonly string[];

  // on any other thread, every request taken in at or after this sequence goes. null removes every
  // request on every thread, for a forget whose sequence cannot be found.
  readonly fromSequence: number | null;
}

// A request taken in at the record's own sequence may already hold the record's text, so the bound
// includes it.
export function pickForgottenInputs<Row extends ForgettableInput>(
  rows: readonly Row[],
  scope: ForgetScope,
): readonly Row[] {
  const fromSequence = scope.fromSequence;

  return rows.filter(
    (row) =>
      fromSequence === null ||
      scope.threads.includes(row.task_id) ||
      row.intake_sequence >= fromSequence,
  );
}
