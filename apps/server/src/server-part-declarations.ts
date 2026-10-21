import { frontPartDeclarations } from './front-part-declarations';
import { memoryPartDeclarations } from './memory-part-declarations';
import { recoveryPartDeclarations } from './recovery-part-declarations';
import type { ServerPartValues } from './server-part-values';
import { toolPartDeclarations } from './tool-part-declarations';
import type { AnyPartDeclaration } from './types';
import { workPartDeclarations } from './work-part-declarations';

export const serverPartDeclarations: readonly AnyPartDeclaration<ServerPartValues>[] = [
  ...frontPartDeclarations,
  ...toolPartDeclarations,
  ...recoveryPartDeclarations,
  ...memoryPartDeclarations,
  ...workPartDeclarations,
];
