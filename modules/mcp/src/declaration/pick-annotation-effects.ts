import type { JSONObject } from '@heynixie/log';
import type { Effect } from '@heynixie/policy';

// The effects a tool's MCP annotations declare, with the standard's defaults for a missing hint: a
// tool that is not read-only, is destructive and talks to an open world. A hint that is present and
// not a boolean leaves the tool with no declaration, so a gap fails closed.
export function pickAnnotationEffects(annotations: JSONObject | null): readonly Effect[] | null {
  const readOnly = annotations?.['readOnlyHint'];
  const destructive = annotations?.['destructiveHint'];

  if (!isHint(readOnly) || !isHint(destructive)) {
    return null;
  }

  if (readOnly === true) {
    return ['read'];
  }

  return destructive === false ? ['write', 'send'] : ['write', 'delete', 'send'];
}

function isHint(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}
