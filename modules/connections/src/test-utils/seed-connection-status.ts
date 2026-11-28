import type { ConnectionsHarness } from './start-connections-harness';

interface StatusChange {
  readonly status: 'active' | 'failing' | 'needs_consent';
  readonly reason?: 'unauthorised' | 'service_error' | 'no_answer';

  // when the status began; the harness clock's time by default
  readonly sinceMs?: number;
  readonly lastSuccessAtMs?: number | null;
}

// Puts a connection in a status the way the credential store does: the row takes the state, and the
// store writes its status record.
export async function seedConnectionStatus(
  harness: Pick<ConnectionsHarness, 'held' | 'readRow' | 'clock'>,
  connectionID: string,
  change: StatusChange,
): Promise<void> {
  const row = await harness.readRow(connectionID);

  if (row === null) {
    throw new Error(`the connection ${connectionID} is not stored`);
  }

  await harness.held.backend.writeState(
    connectionID,
    {
      status: change.status,
      ...(change.reason === undefined ? {} : { reason: change.reason }),
      sinceMs: change.sinceMs ?? harness.clock.now(),
      lastSuccessAtMs: change.lastSuccessAtMs ?? null,
      failures: 0,
      retryAtMs: null,
    },
    row.removal_counter,
  );

  await harness.held.recorder.write({
    event: 'status_changed',
    credentialID: connectionID,
    status: change.status,
    ...(change.reason === undefined ? {} : { reason: change.reason }),
  });
}
