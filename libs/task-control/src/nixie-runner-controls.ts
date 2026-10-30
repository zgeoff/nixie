import type { TaskControl } from './types';

export const nixieRunnerControls: readonly TaskControl[] = [
  'pause',
  'resume',
  'stop',
  'restart',
  'close',
  'interrupt',
];
