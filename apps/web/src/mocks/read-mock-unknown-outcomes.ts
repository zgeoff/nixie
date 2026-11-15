import { store } from './store';

// The unknown outcomes that wait on the owner, oldest first, as the host lists them before every
// other group.
export function readMockUnknownOutcomes() {
  const waiting = store.unknownOutcomeRows.findMany((query) =>
    query.where((row) => row.state === 'waiting'),
  );

  return waiting
    .toSorted((left, right) => left.sequence - right.sequence)
    .map((row) => ({
      group: 'unknown_outcome' as const,
      action: {
        actionID: row.actionID,
        tool: row.tool,
        sentence: row.sentence,
        fields: { ...row.fields },
        riskClass: row.riskClass,
        reason: row.reason,
        becameUnknownAt: row.becameUnknownAt,
        attempts: row.attempts.map((attempt) => ({ ...attempt })),
        checks: row.checks.map((check) => ({ ...check })),
      },
      task: row.taskID === null ? null : { id: row.taskID, name: row.taskID },
      choices: ['happened' as const, 'retry' as const, 'drop' as const],
      passkeyChoices: row.riskClass === 'routine' ? [] : ['retry' as const],
    }));
}
