import type { McpToolRow } from '../rows/mcp-tables';
import type { FoundForm } from '../rows/read-forms-by-hash';

// Whether the forms hold what each row's pin names. A pin that moved since the forms were read to a
// hash they lack means another write ran in between.
export function hasFormsOfPins(
  rows: readonly McpToolRow[],
  forms: ReadonlyMap<string, FoundForm>,
): boolean {
  return rows.every((row) => row.pinned_hash === null || forms.has(row.pinned_hash));
}
