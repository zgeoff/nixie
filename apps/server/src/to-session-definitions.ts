import type { DefinitionsInForce } from '@heynixie/definitions';
import type { SessionDefinitions } from '@heynixie/sessions';

export function toSessionDefinitions(inForce: DefinitionsInForce | null): SessionDefinitions {
  return {
    persona: inForce?.persona ?? '',
    personaHash: inForce?.personaVersion ?? '',
    policyHash: inForce?.policyHash ?? '',
  };
}
