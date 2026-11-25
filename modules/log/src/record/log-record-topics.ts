import type { RecordTopics } from './register-record-topics';

// The topics of the kinds this module owns. A reset rebuilds the task list, and a pause or a
// spending stop reaches the pause the client reads.
export const logRecordTopics = {
  log_reset: ['tasks'],
  'nixie.paused': ['nixie', 'tasks'],
  'nixie.resumed': ['nixie', 'tasks'],
  'nixie.task_exempted': ['nixie', 'tasks'],
  'recovery.started': ['nixie', 'tasks'],
  'spend.stop_tripped': ['spend', 'nixie', 'tasks'],
  'spend.stop_cleared': ['spend', 'nixie', 'tasks'],
  'spend.route_stopped': ['spend', 'tasks'],
  'spend.route_cleared': ['spend', 'tasks'],
  'spend.route_held': ['spend', 'tasks'],
  'spend.wait_notice': ['tasks'],
} as const satisfies RecordTopics;
