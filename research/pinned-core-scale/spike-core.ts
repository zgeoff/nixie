// The pinned core as nixie builds it: filled to the budget with the store's own count, and rendered
// with the production opening, change note, status and inbox renderers.
// @boundaries-ignore a spike imports the code it measures
import type { LogRecord } from '../../modules/log/src/index';
// @boundaries-ignore a spike imports the code it measures
import { buildPinnedCoreStatus } from '../../modules/memory/src/build-pinned-core-status';
// @boundaries-ignore a spike imports the code it measures
import { countPinnedCoreTokens } from '../../modules/memory/src/count-pinned-core-tokens';
// @boundaries-ignore a spike imports the code it measures
import { defaultGateLimits } from '../../modules/memory/src/default-gate-limits';
// @boundaries-ignore a spike imports the code it measures
import { defaultOwnerPronouns } from '../../modules/memory/src/default-owner-pronouns';
// @boundaries-ignore a spike imports the code it measures
import { findNoAllowRule } from '../../modules/memory/src/find-no-allow-rule';
// @boundaries-ignore a spike imports the code it measures
import { getPinnedCoreBudget } from '../../modules/memory/src/get-pinned-core-budget';
// @boundaries-ignore a spike imports the code it measures
import { buildModelStatus } from '../../modules/sessions/src/build-model-status';
// @boundaries-ignore a spike imports the code it measures
import { buildStartStatus } from '../../modules/sessions/src/build-start-status';
// @boundaries-ignore a spike imports the code it measures
import { buildStartTimeStatus } from '../../modules/sessions/src/build-start-time-status';
// @boundaries-ignore a spike imports the code it measures
import { buildStatusRegistry } from '../../modules/sessions/src/build-status-registry';
// @boundaries-ignore a spike imports the code it measures
import { encodeInboxUUID } from '../../modules/sessions/src/encode-inbox-uuid';
// @boundaries-ignore a spike imports the code it measures
import { formatMessageTime } from '../../modules/sessions/src/format-message-time';
// @boundaries-ignore a spike imports the code it measures
import { renderCoreChanges } from '../../modules/sessions/src/render-core-changes';
// @boundaries-ignore a spike imports the code it measures
import { renderInboxMessage } from '../../modules/sessions/src/render-inbox-message';
// @boundaries-ignore a spike imports the code it measures
import { renderPinnedMemory } from '../../modules/sessions/src/render-pinned-memory';
// @boundaries-ignore a spike imports the code it measures
import { renderSystemPrompt } from '../../modules/sessions/src/render-system-prompt';
// @boundaries-ignore a spike imports the code it measures
import type { MemoryItem, MemoryLineOptions, PinnedCoreUse } from '../../modules/sessions/src/types';
// @boundaries-ignore a spike imports the code it measures
import type { InboxMessage } from '../../libs/wire/src/index';
// @boundaries-ignore a spike imports the code it measures
import { renderSystemMessage } from '../../libs/wire/src/index';
import { candidateItems, defaultZone, ownerName, persona } from './spike-fixtures';

export const coreBudget = getPinnedCoreBudget({});

// the store's count reads only the owner's name from the gate
const countContext = {
  gate: {
    check: () =>
      Promise.resolve({ verdict: 'unsure' as const, reason: 'no checker', model: 'none', failure: 'error' as const }),
    clock: { now: () => Date.now() },
    defaultZone,
    findAllowRule: findNoAllowRule,
    limits: defaultGateLimits,
    ownerName,
    ownerPronouns: defaultOwnerPronouns,
  },
};

// pins candidates in order until the next pin would take the core past its budget
export function buildFullCore(): readonly MemoryItem[] {
  const core: MemoryItem[] = [];

  for (const item of candidateItems) {
    if (countPinnedCoreTokens(countContext, [...core, item]) > coreBudget) {
      return core;
    }

    core.push(item);
  }

  return core;
}

export function buildCoreUse(core: readonly MemoryItem[]): PinnedCoreUse {
  return { items: core.length, tokens: countPinnedCoreTokens(countContext, core), budget: coreBudget };
}

export interface CoreChange {
  readonly edits: readonly MemoryItem[];
  readonly unpinIDs: readonly string[];
  readonly savedAt: Date;
}

// swaps each edited item in place, drops the unpinned ones and appends the new pins, as the store
// keeps pin order; each edit carries the day of its change
export function buildChangedCore(
  core: readonly MemoryItem[],
  change: CoreChange,
): readonly MemoryItem[] {
  const edited = new Map(
    change.edits.map((item) => [item.itemID, { ...item, recordedAt: change.savedAt.getTime() }]),
  );
  const unpinned = new Set(change.unpinIDs);
  const kept = core
    .filter((item) => !unpinned.has(item.itemID))
    .map((item) => edited.get(item.itemID) ?? item);
  const keptIDs = new Set(kept.map((item) => item.itemID));

  return [...kept, ...[...edited.values()].filter((item) => !keptIDs.has(item.itemID))];
}

export function buildLines(now: Date): MemoryLineOptions {
  return { ownerName, defaultZone, now };
}

export function renderSpikeSystemPrompt(): string {
  return renderSystemPrompt(persona, null, { ownerName });
}

// the blocks a first session opens with: the pinned memory and the status, with the memory
// package's two pinned-core entries
export async function renderOpening(
  core: readonly MemoryItem[],
  lines: MemoryLineOptions,
  model: string,
): Promise<readonly string[]> {
  const at = formatMessageTime(lines.now, null, lines);
  const facts = { start: { kind: 'first' as const }, openedAt: lines.now, times: lines, model };
  const registry = buildStatusRegistry([
    buildStartStatus(),
    buildStartTimeStatus(),
    buildModelStatus(),
    ...buildPinnedCoreStatus(() => Promise.resolve(buildCoreUse(core))),
  ]);
  const status = await Promise.all(registry.map((entry) => entry.read(facts)));

  return [
    renderSystemMessage({ type: 'pinned-memory', at, body: renderPinnedMemory(core, lines) }),
    renderSystemMessage({ type: 'status', at, body: status.map((line) => `- ${line.text}`).join('\n') }),
  ];
}

// the change note the turn after a core change puts before the message, or null when nothing changed
export function renderChangeNote(
  previous: readonly MemoryItem[],
  current: readonly MemoryItem[],
  lines: MemoryLineOptions,
): string | null {
  const currentIDs = new Set(current.map((item) => item.itemID));
  const unpinnedShortIDs = new Map(
    previous.filter((item) => !currentIDs.has(item.itemID)).map((item) => [item.itemID, item.shortID]),
  );
  const body = renderCoreChanges(
    previous.map((item) => ({ itemID: item.itemID, version: item.version })),
    current,
    { ...lines, unpinnedShortIDs, use: buildCoreUse(current) },
  );

  return body === null
    ? null
    : renderSystemMessage({ type: 'pinned-memory-changes', at: formatMessageTime(lines.now, null, lines), body });
}

// one owner message with the blocks before it, joined as the live turn joins them
export function buildOwnerInput(
  sequence: number,
  sentAt: Date,
  text: string,
  blocks: readonly string[],
): readonly InboxMessage[] {
  const record: LogRecord = {
    sequence,
    recordedAt: sentAt,
    kind: 'owner_message',
    definitions: { snapshotHash: 'sha256:spike' },
    thread: null,
    stepKey: null,
    parent: null,
    contentSource: null,
    decision: null,
    promptCause: null,
    approval: null,
    payload: { timeZone: defaultZone },
    erasable: { status: 'readable', fields: { text } },
  };

  return [
    {
      uuid: encodeInboxUUID(sequence),
      text: [...blocks, renderInboxMessage(record, buildLines(sentAt))].join('\n\n'),
    },
  ];
}
