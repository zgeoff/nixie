import type { DefinitionsInForce } from '@heynixie/definitions';
import type { SessionDefinitions } from '@heynixie/sessions';

// The definitions a conversation step runs under, from the definitions in force. Before the first
// seed, no persona is in force, so every value is empty and the first seed's persona opens a new
// session.
export function toSessionDefinitions(inForce: DefinitionsInForce | null): SessionDefinitions {
  return {
    persona: inForce?.persona ?? '',
    personaHash: inForce?.personaVersion ?? '',
    policyHash: inForce?.policyHash ?? '',
  };
}
