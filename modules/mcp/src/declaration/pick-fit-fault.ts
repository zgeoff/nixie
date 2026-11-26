import type { McpToolOverride } from '@heynixie/policy';
import { collectArgumentPaths } from '../registry/collect-argument-paths';
import { collectTopLevelArguments } from '../registry/collect-top-level-arguments';
import type { ToolForm } from '../types';
import { pickIdempotencyKey } from './pick-idempotency-key';

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

  const idempotencyKey = pickIdempotencyKey(override.reconcile);
  const key = idempotencyKey === null ? [] : [idempotencyKey];
  const amount = override.amount === null ? [] : [override.amount];

  const missing = [
    ...[...override.destinations, ...amount, ...key].filter((name) => !topLevel.has(name)),
    ...(override.content ?? []).filter((name) => !paths.has(name)),
  ];

  if (missing.length > 0) {
    return `the override names ${[...new Set(missing)].join(', ')}, which the input schema lacks`;
  }

  // the proxy fills the key after the owner approves, so no argument that decides anything may be it
  const overlap = [...override.destinations, ...(override.content ?? []), ...amount].filter(
    (name) => name === idempotencyKey,
  );

  if (overlap.length > 0) {
    return `the override names ${overlap[0] ?? ''} as the idempotency key and as an argument the call is judged by`;
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
