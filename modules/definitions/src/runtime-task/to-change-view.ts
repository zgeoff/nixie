import type { RuntimeTaskDefinitionRow } from '../types';
import type { DefinitionChangeView } from './pick-definition-move';

export function toChangeView(row: RuntimeTaskDefinitionRow): DefinitionChangeView {
  return {
    changeID: row.change_id,
    shortID: row.short_id,
    operation: row.operation,
    hash: row.definition_hash,
    previous: row.previous_hash,
    base: row.base_hash,
    definitions: row.definitions_hash,
    replaces: row.replaces,
    state: row.state,
    cause: row.state_cause,
  };
}
