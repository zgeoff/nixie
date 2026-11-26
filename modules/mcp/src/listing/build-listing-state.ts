import type { McpToolRow } from '../rows/mcp-tables';
import type { FormStatus, FoundForm } from '../rows/read-forms-by-hash';
import type { ToolForm } from '../types';
import type { ListingState } from './types';

export function buildListingState(
  stored: readonly McpToolRow[],
  forms: ReadonlyMap<string, FoundForm>,
): ListingState {
  const formStatuses = new Map(
    [...forms].map(([hash, found]): [string, FormStatus] => [hash, found.status]),
  );

  const pinnedForms = new Map(
    stored.map((row): [string, ToolForm | null] => [
      row.tool,
      row.pinned_hash === null ? null : (forms.get(row.pinned_hash)?.form ?? null),
    ]),
  );

  return { rows: new Map(stored.map((row) => [row.tool, row])), pinnedForms, formStatuses };
}
