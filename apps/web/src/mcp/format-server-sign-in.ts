import { match } from 'ts-pattern';
import type { McpServer } from './types';

export function formatServerSignIn(signIn: McpServer['signIn']): string {
  return match(signIn)
    .with('not_added', () => 'Waiting for your approval')
    .with('no_grant', () => 'Not signed in')
    .with('needs_consent', () => 'Needs sign-in')
    .with('ok', () => 'Signed in')
    .exhaustive();
}
