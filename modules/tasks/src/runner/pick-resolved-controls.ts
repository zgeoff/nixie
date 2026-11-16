import { taskControls } from '@heynixie/task-control';
import type { TaskControl } from '@heynixie/task-control';
import { match } from 'ts-pattern';
import type { TaskRunnerResolution } from './types';

// The controls that a task takes. A task whose stored runner names no definition takes none. A task
// that no runner owns, such as one that a test creates, keeps every control.
export function pickResolvedControls(resolution: TaskRunnerResolution): readonly TaskControl[] {
  return match(resolution)
    .with({ status: 'found' }, (found) => found.definition.controls)
    .with({ status: 'unknown' }, () => [])
    .with({ status: 'none' }, () => taskControls)
    .exhaustive();
}
