import { match } from 'ts-pattern';
import type { ListedConnection } from '../types';

export function formatConnectionStatus(connection: ListedConnection): string {
  return match(connection.status)
    .with('active', () => 'Active')
    .with('failing', () =>
      match(connection.reason)
        .with('unauthorised', () => 'Failing: Google refused the token')
        .with('service_error', () => 'Failing: Google answered with an error')
        .with('no_answer', () => 'Failing: Google did not answer')
        .with(null, () => 'Failing')
        .exhaustive(),
    )
    .with('needs_consent', () => 'Needs consent')
    .with('expiring', () => 'Expiring: its grant ends within 3 days')
    .with('forgotten', () => 'Forgotten')
    .exhaustive();
}
