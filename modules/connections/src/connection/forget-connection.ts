import { readRevocationOutcomes } from '../revocation/read-revocation-outcomes';
import type { ServiceContext } from '../service-context';
import type { ForgetConnectionResult, ForgetState } from '../types';
import { readConnectionRowByShortID } from './read-connection-rows';
import { readForgetState } from './read-forget-state';

// Forgets a connection and runs the forget to its end: Google's revocation once, then the keys. A
// step that fails leaves the forget open for the runner's catch-up, and the state says so.
export async function forgetConnection(
  context: ServiceContext,
  shortID: string,
): Promise<ForgetConnectionResult> {
  const row = await readConnectionRowByShortID(context.log, shortID);

  if (row?.binding !== 'enabled') {
    return { kind: 'connection_not_found' };
  }

  const begun = await context.forget.begin({ connection: row.connection_id }, { by: 'user' });

  if (begun.status === 'refused') {
    return { kind: 'connection_not_found' };
  }

  await context.forget.finish(row.connection_id).catch(() => null);

  const outcomes = await readRevocationOutcomes(context.log);

  return {
    kind: 'forgotten',
    connectionID: row.connection_id,
    state: await readForgetState(context.log, row.connection_id, outcomes),
  };
}

export async function readConnectionForgetState(
  context: ServiceContext,
  shortID: string,
): Promise<{ readonly connection: string; readonly state: ForgetState } | null> {
  const row = await readConnectionRowByShortID(context.log, shortID);

  if (row === null) {
    return null;
  }

  const outcomes = await readRevocationOutcomes(context.log);

  return {
    connection: shortID,
    state: await readForgetState(context.log, row.connection_id, outcomes),
  };
}
