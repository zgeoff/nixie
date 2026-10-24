import type { DefinitionsExportState } from './types';

const transitions: Readonly<Record<DefinitionsExportState, readonly DefinitionsExportState[]>> = {
  exporting: ['exporting', 'opened', 'closed'],
  opened: ['exporting', 'closed'],
  closed: [],
};

export function canMoveDefinitionsExport(
  from: DefinitionsExportState,
  to: DefinitionsExportState,
): boolean {
  return transitions[from].includes(to);
}
