export type LogTestRecordKind =
  | 'owner_message'
  | 'model.reply'
  | 'model.turn_ended'
  | 'tool_called'
  | 'tool_result'
  | 'definitions_seeded'
  | 'session.enrolled'
  | 'session_kept'
  | 'note_written'
  | 'task_created'
  | 'turn_finished';

declare module './types' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<LogTestRecordKind, true> {}
}
