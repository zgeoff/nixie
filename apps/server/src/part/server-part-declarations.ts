import type { AnyPartDeclaration } from '../types';
import { callsPartDeclarations } from './calls-part-declarations';
import { devicesPartDeclarations } from './devices-part-declarations';
import { frontPartDeclarations } from './front-part-declarations';
import { memoryPartDeclarations } from './memory-part-declarations';
import { restartSweepPartDeclarations } from './restart-sweep-part-declarations';
import type { ServerPartValues } from './server-part-values';
import { toolPartDeclarations } from './tool-part-declarations';
import { workPartDeclarations } from './work-part-declarations';

export const serverPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  ...frontPartDeclarations,

  // the feature parts that core parts read through uses come before them, because a part reads only
  // the parts that started ahead of it
  ...callsPartDeclarations,
  ...devicesPartDeclarations,
  ...toolPartDeclarations,
  ...restartSweepPartDeclarations,
  ...memoryPartDeclarations,
  ...workPartDeclarations,
];
