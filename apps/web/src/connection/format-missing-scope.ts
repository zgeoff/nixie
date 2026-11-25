import { findHeldBackTools } from './find-held-back-tools';

export interface MissingScopeInput {
  readonly scope: string;
  readonly reason: 'not_granted' | 'api_disabled';
}

export function formatMissingScope(missing: MissingScopeInput): string {
  const reason =
    missing.reason === 'not_granted'
      ? 'Google did not grant it'
      : 'its API is off in your Google Cloud project';

  const tools = findHeldBackTools(missing.scope);

  return tools === null
    ? `${missing.scope}: ${reason}.`
    : `${missing.scope}: ${reason}. This holds back ${tools}.`;
}
