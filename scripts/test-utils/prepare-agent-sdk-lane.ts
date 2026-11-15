import type { LaneContext } from '@zgeoff/rig';
import { runLaneBuilds } from './run-lane-builds';

export default function prepareAgentSDKLane(context: LaneContext): void {
  runLaneBuilds(context.environment, ['test:guest-bundles']);
}
