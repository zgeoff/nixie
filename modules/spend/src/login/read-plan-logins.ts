import type { PlanLogins, SpendContext } from '../types';

// Reads the plan logins from the gateway and holds the answer, so each read of the gateway's status
// brings the logins with it.
export async function readPlanLogins(
  source: Pick<SpendContext, 'gateway' | 'planLogins'>,
): Promise<PlanLogins> {
  const answer = await source.gateway.readChatGPTLogins();

  const logins: PlanLogins =
    answer.kind === 'ok' ? { state: 'read', routes: answer.value } : { state: 'unreachable' };

  source.planLogins.write(logins);

  return logins;
}
