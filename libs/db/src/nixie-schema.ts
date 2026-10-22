import { actionsMigration } from './actions-migration';
import { apiMigration } from './api-migration';
import { definitionsMigration } from './definitions-migration';
import { eventLogMigration } from './event-log-migration';
import { memoryKindsMigration } from './memory-kinds-migration';
import { memoryMigrations } from './memory-migrations';
import { memorySubjectsMigration } from './memory-subjects-migration';
import { memoryUntilMigration } from './memory-until-migration';
import { recordAttachmentsMigration } from './record-attachments-migration';
import { sandboxesMigration } from './sandboxes-migration';
import { skillExportAttemptsMigration } from './skill-export-attempts-migration';
import { skillExportsMigration } from './skill-exports-migration';
import { skillsMigration } from './skills-migration';
import { tasksMigration } from './tasks-migration';
import type { BuildSchema } from './types';
import { webFetchLinksMigration } from './web-fetch-links-migration';
import { writtenSkillsMigration } from './written-skills-migration';

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
    webFetchLinksMigration,
    memoryUntilMigration,
  ],
  oldestReader: 23,
};
