import type { LaneContext } from '@zgeoff/rig';
import { runLaneBuilds } from './run-lane-builds';

export default function prepareResticLane(context: LaneContext): void {
  runLaneBuilds(context.environment, ['test:backup-job-build']);
}
