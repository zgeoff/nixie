import type { LaneContext } from '@zgeoff/rig';
import { runLaneBuilds } from './run-lane-builds';

// rig builds each program that rig.config.ts declares. The suites also read the encoder's model
// files, the previous release, and the server's test and release bundles, which take longer to
// build than a test's limit.
export default function prepareE2ELane(context: LaneContext): void {
  runLaneBuilds(context.environment, ['models', 'test:bundles', 'test:previous-release-build']);
}
