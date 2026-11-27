import type { RecordTopics } from './register-record-topics';

// The topics of the kinds this module owns. A reset rebuilds the task list, and a pause or a
// spending stop reaches the pause the client reads. An erasure changes what the memory page and the
// notebook show, whichever kind it takes.
export const logRecordTopics = {
  'erasure.started': ['memory', 'notebook'],
  'erasure.finished': ['memory', 'notebook'],
  log_reset: ['tasks'],
  'nixie.paused': ['nixie', 'tasks'],
  'nixie.resumed': ['nixie', 'tasks'],
  'nixie.task_exempted': ['nixie', 'tasks'],
  'recovery.started': ['nixie', 'tasks'],
  'spend.stop_tripped': ['spend', 'nixie', 'tasks'],
  'spend.stop_cleared': ['spend', 'nixie', 'tasks'],
  'spend.route_stopped': ['spend', 'tasks'],
  'spend.route_restated': ['spend', 'tasks'],
  'spend.route_cleared': ['spend', 'tasks'],
  'spend.route_held': ['spend', 'tasks'],
  'spend.provider_stopped': ['spend', 'tasks'],
  'spend.provider_restated': ['spend', 'tasks'],
  'spend.provider_cleared': ['spend', 'tasks'],
  'spend.provider_held': ['spend', 'tasks'],
  'spend.wait_notice': ['tasks'],
} as const satisfies RecordTopics;
