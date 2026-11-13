// The first 40 migrations as released. The list never grows: a later migration adds its own file.
export const releasedMigrations = [
  { fileName: '0001-event-log-migration.ts', name: 'create the event log' },
  { fileName: '0002-definitions-migration.ts', name: 'create the definitions tables' },
  { fileName: '0003-sandboxes-migration.ts', name: 'create the sandboxes projection' },
  { fileName: '0004-tasks-migration.ts', name: 'create the tasks, timers and leases' },
  { fileName: '0005-actions-migration.ts', name: 'create the actions projection' },
  {
    fileName: '0006-api-migration.ts',
    name: 'create the identity record, enrolment codes, client actions and refusals',
  },
  { fileName: '0007-memory-migration.ts', name: 'create the memory projections' },
  { fileName: '0008-memory-writer-migration.ts', name: 'create the memory writer projection' },
  { fileName: '0009-memory-gate-migration.ts', name: 'create the memory gate tables' },
  {
    fileName: '0010-memory-proposal-merges-migration.ts',
    name: 'create the memory proposal merges table',
  },
  { fileName: '0011-memory-short-ids-migration.ts', name: 'add a short ID to each memory item' },
  {
    fileName: '0012-memory-consolidation-migration.ts',
    name: 'create the memory consolidation tables',
  },
  {
    fileName: '0013-memory-consolidation-comments-migration.ts',
    name: 'add a short ID and a comment to each consolidation change',
  },
  {
    fileName: '0014-memory-consolidation-summary-migration.ts',
    name: 'add a sealed summary to each consolidation run',
  },
  {
    fileName: '0015-record-attachments-migration.ts',
    name: 'add the sealed attachments of a record',
  },
  {
    fileName: '0016-memory-kinds-migration.ts',
    name: 'add a kind to each memory item and proposal',
  },
  { fileName: '0017-skills-migration.ts', name: 'create the skill tables' },
  {
    fileName: '0018-memory-subjects-migration.ts',
    name: 'add a subject to each memory item and proposal',
  },
  {
    fileName: '0019-written-skills-migration.ts',
    name: 'create the store of skills that nixie writes',
  },
  {
    fileName: '0020-skill-exports-migration.ts',
    name: 'create the export state of skills that nixie writes',
  },
  {
    fileName: '0021-skill-export-attempts-migration.ts',
    name: 'create the marks of skill exports in flight',
  },
  {
    fileName: '0022-web-fetch-links-migration.ts',
    name: 'create the link store of the web fetch tool',
  },
  {
    fileName: '0023-memory-until-migration.ts',
    name: 'add an end time to each memory version and item, and the lapse origin',
  },
  {
    fileName: '0024-definition-seed-repository-migration.ts',
    name: 'add the repository that each definitions seed came from',
  },
  {
    fileName: '0025-memory-pin-proposals-migration.ts',
    name: 'admit the pin operation in memory proposals',
  },
  {
    fileName: '0026-prompt-approvals-migration.ts',
    name: 'create the approved prompt overrides and their export state',
  },
  {
    fileName: '0027-task-messages-migration.ts',
    name: 'create the task messages and the hop of each task step',
  },
  {
    fileName: '0028-moments-migration.ts',
    name: 'create the moments, their reflections, links and text records',
  },
  {
    fileName: '0029-memory-sensitive-migration.ts',
    name: 'add a sensitive flag to each memory item and proposal',
  },
  {
    fileName: '0030-task-routes-migration.ts',
    name: 'record who started each task, in which step, and where each routed message went',
  },
  {
    fileName: '0031-memory-subject-changes-migration.ts',
    name: 'add the subject changes of memory proposals and versions',
  },
  {
    fileName: '0032-task-controls-migration.ts',
    name: 'record a pause asked of a running task, the state a resume returns to, and each timer a stop withdrew',
  },
  {
    fileName: '0033-action-cancel-migration.ts',
    name: 'record the stop that cancelled each action before its first attempt',
  },
  { fileName: '0034-backup-sets-migration.ts', name: 'create the backup sets and their receipts' },
  {
    fileName: '0035-drop-message-routes-migration.ts',
    name: 'drop the table of where each routed message went',
  },
  {
    fileName: '0036-search-calls-migration.ts',
    name: "create the search tool's count of calls a day",
  },
  {
    fileName: '0037-web-fetch-pages-migration.ts',
    name: 'create the page store of the web fetch tool',
  },
  {
    fileName: '0038-backup-notices-migration.ts',
    name: 'create the notices of failed and missing backup receipts',
  },
  { fileName: '0039-rules-migration.ts', name: 'create the rule store' },
  { fileName: '0040-rule-exports-migration.ts', name: 'create the rule exports' },
] as const;
