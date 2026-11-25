import type { McpToolOverride } from '@heynixie/policy';
import { collectArgumentPaths } from '../registry/collect-argument-paths';
import type { ToolForm } from '../types';

// Why an override no longer fits the tool's pinned form, or null when it does. A destination, an
// amount and an idempotency key name a top-level argument, a content entry names an argument at any
// depth, and a check names another tool that the server lists.
export function pickFitFault(
  override: McpToolOverride,
  pinned: ToolForm,
  serverToolNames: ReadonlySet<string>,
): string | null {
  const topLevel = collectTopLevelArguments(pinned.inputSchema);

  const paths = new Set(collectArgumentPaths(pinned.inputSchema));

  const key =
    override.reconcile !== null && 'idempotencyKey' in override.reconcile
      ? [override.reconcile.idempotencyKey]
      : [];

  const amount = override.amount === null ? [] : [override.amount];

  const missing = [
    ...[...override.destinations, ...amount, ...key].filter((name) => !topLevel.has(name)),
    ...(override.content ?? []).filter((name) => !paths.has(name)),
  ];

  if (missing.length > 0) {
    return `the override names ${[...new Set(missing)].join(', ')}, which the input schema lacks`;
  }

  if (
    override.reconcile !== null &&
    'check' in override.reconcile &&
    !serverToolNames.has(override.reconcile.check)
  ) {
    return `the override checks with ${override.reconcile.check}, which the server lacks`;
  }

  return null;
}

function collectTopLevelArguments(inputSchema: unknown): ReadonlySet<string> {
  const properties: unknown =
    typeof inputSchema === 'object' && inputSchema !== null
      ? Reflect.get(inputSchema, 'properties')
      : undefined;

  const hasProperties =
    typeof properties === 'object' && properties !== null && !Array.isArray(properties);

  const names = hasProperties ? Object.keys(properties) : [];

  return new Set(names);
}
