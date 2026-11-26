import type { McpToolRow } from '../rows/mcp-tables';
import type { FormStatus } from '../rows/read-forms-by-hash';
import type { ToolForm } from '../types';

// What the listing's decisions read beside the listing itself: the tool rows of the server, the
// form each pin names when it can be read, and whether each listed hash has a readable form.
export interface ListingState {
  readonly rows: ReadonlyMap<string, McpToolRow>;
  readonly pinnedForms: ReadonlyMap<string, ToolForm | null>;
  readonly formStatuses: ReadonlyMap<string, FormStatus>;
}
