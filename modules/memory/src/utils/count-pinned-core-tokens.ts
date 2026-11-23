import { countTextTokens } from '@heynixie/compaction';
import type { ContentSource } from '@heynixie/log';
import type { MemoryApproval } from '@heynixie/sessions';
import { renderSubjectGroups } from '@heynixie/sessions';
import type { MemoryOrigin, MemorySubject } from '../types';

export interface CorePin {
  readonly itemID: string;
  readonly shortID: string;
  readonly subject: MemorySubject;

  readonly version: number;
  readonly revision: number;
  readonly text: string;
  readonly origin: MemoryOrigin;
  readonly source: ContentSource;
  readonly approval: MemoryApproval | null;
  readonly evidenceQuote: string | null;
}

export interface CoreCountContext {
  readonly gate: { readonly ownerName: string | null };
}

const widestDay = Date.UTC(2000, 8, 30);
const countingFence = 'f';
const fenceOpen = `<memory-text fence="${countingFence}">\n`;
const fenceClose = `\n</memory-text fence="${countingFence}">`;

export function countPinnedCoreTokens(context: CoreCountContext, core: readonly CorePin[]): number {
  if (core.length === 0) {
    return 0;
  }

  const lines = { ownerName: context.gate.ownerName, defaultZone: 'UTC', now: new Date(0) };

  // The budget counts what the owner pinned. The fence markup around each item's text is a fixed
  // cost of rendering that the budget leaves out.
  const rendered = renderSubjectGroups(
    core.map((item) => ({ ...item, recordedAt: widestDay })),
    lines,
    () => countingFence,
  ).join('\n');

  return countTextTokens(rendered.replaceAll(fenceOpen, '').replaceAll(fenceClose, ''));
}
