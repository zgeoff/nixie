import type { store } from './store';

type StoredRow = ReturnType<typeof store.approvalRows.all>[number];

// The choices of a row that take a passkey, as the host builds them: an approval of a row that
// always asks or lifts.
export function pickMockPasskeyChoices(
  row: Pick<StoredRow, 'choices' | 'riskClass'>,
): readonly StoredRow['choices'][number][] {
  return row.riskClass === 'routine'
    ? []
    : row.choices.filter((choice) => choice === 'approve' || choice === 'always_allow');
}
