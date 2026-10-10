import { eventLogMigration } from './event-log-migration';
import type { BuildSchema } from './types';

// The schema this build writes. A migration appends to the list and never changes an entry already
// released. Raise oldestReader only when a release leaves a schema the release before cannot read,
// and say so in its pull request.
export const nixieSchema: BuildSchema = {
  migrations: [eventLogMigration],
  oldestReader: 0,
};
