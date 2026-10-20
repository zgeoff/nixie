import { actionsMigration } from './actions-migration';
import { apiMigration } from './api-migration';
import { definitionsMigration } from './definitions-migration';
import { eventLogMigration } from './event-log-migration';
import { memoryKindsMigration } from './memory-kinds-migration';
import { memoryMigrations } from './memory-migrations';
import { memorySubjectsMigration } from './memory-subjects-migration';
import { recordAttachmentsMigration } from './record-attachments-migration';
import { sandboxesMigration } from './sandboxes-migration';
import { skillExportAttemptsMigration } from './skill-export-attempts-migration';
import { skillExportsMigration } from './skill-exports-migration';
import { skillsMigration } from './skills-migration';
import { tasksMigration } from './tasks-migration';
import type { BuildSchema } from './types';
import { writtenSkillsMigration } from './written-skills-migration';

// The schema this build writes. A migration appends to the list and never changes an entry already
// released. Raise oldestReader only when a release leaves a schema the release before cannot read,
// and say so in its pull request.
export const nixieSchema: BuildSchema = {
  migrations: [
    eventLogMigration,
    definitionsMigration,
    sandboxesMigration,
    tasksMigration,
    actionsMigration,
    apiMigration,
    ...memoryMigrations,
    recordAttachmentsMigration,
    memoryKindsMigration,
    skillsMigration,
    memorySubjectsMigration,
    writtenSkillsMigration,
    skillExportsMigration,
    skillExportAttemptsMigration,
  ],
  oldestReader: 0,
};
