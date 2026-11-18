import { join } from 'node:path';
import type { LaneContext, LaneStart } from '@zgeoff/rig';
import rig from '../../rig.config';
import { runLaneBuilds } from './run-lane-builds';

// rig sets the variable that `resolveProgram` reads only for the e2e lane, and a restic suite runs
// the backup job the e2e lane declares, so this hook builds the job and names it the same way.
const backupJobVariable = 'RIG_PROGRAM_BACKUP_JOB';

export default function prepareResticLane(context: LaneContext): LaneStart {
  runLaneBuilds(context.environment, ['test:backup-job-program']);

  const program = rig.programs['backup-job'];

  if (program === undefined) {
    throw new Error('rig.config.ts declares no backup-job program');
  }

  return {
    environment: { [backupJobVariable]: join(context.repoRoot, program.package, program.artifact) },
  };
}
