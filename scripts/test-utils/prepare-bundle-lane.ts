import type { LaneContext } from '@zgeoff/rig';
import { runLaneBuilds } from './run-lane-builds';

export default function prepareBundleLane(context: LaneContext): void {
  runLaneBuilds(context.environment, ['test:web-build', 'test:backup-job-build']);
}
