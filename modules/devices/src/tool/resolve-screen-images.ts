import type { ImageState } from '@heynixie/connectors';
import { readImageState } from '@heynixie/connectors';
import type { ScreenContent } from '@heynixie/contract';
import type { Log } from '@heynixie/log';

export interface ResolvedScreenImages {
  // the blocks with each image named by its short ID
  readonly blocks: readonly ScreenContent[];
  readonly states: readonly ImageState[];
}

interface ResolvedBlock {
  readonly block: ScreenContent;
  readonly states: readonly ImageState[];
}

// Looks up each image a block names, by short ID or by UUID, and names it by its short ID.
export async function resolveScreenImages(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  blocks: readonly ScreenContent[],
): Promise<ResolvedScreenImages> {
  const resolved = await Promise.all(
    blocks.map(async (block): Promise<ResolvedBlock> => {
      if (block.kind === 'markdown') {
        return { block, states: [] };
      }

      const found = await readImageState(log, block.image);

      return {
        block: { ...block, image: found.image ?? block.image },
        states: [found.state],
      };
    }),
  );

  return {
    blocks: resolved.map((entry) => entry.block),
    states: resolved.flatMap((entry) => entry.states),
  };
}
