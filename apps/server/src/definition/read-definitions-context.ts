import type { DefinitionsContext, DefinitionsExportSweep } from '@heynixie/definitions';
import type { ServerParts } from '../types';
import { buildDefinitionsContext } from './build-definitions-context';

// Null until the server parts start, because the tool endpoint and the HTTP part start before them.
export function readDefinitionsContext(
  parts: ServerParts | null,
  exports: DefinitionsExportSweep | null,
): DefinitionsContext | null {
  return parts === null ? null : buildDefinitionsContext(parts, exports);
}
