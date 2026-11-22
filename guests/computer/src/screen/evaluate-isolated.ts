import type { Page } from 'playwright-core';
import { z } from 'zod';

const frameSchema = z.object({ id: z.string() });
const frameTreeSchema = z.object({ frameTree: z.object({ frame: frameSchema }) });
const worldSchema = z.object({ executionContextId: z.number() });
const evaluatedSchema = z.object({ result: z.object({ value: z.unknown() }) });

// Runs a script in a world of the page's own that the page's scripts cannot reach, through the
// browser's debugging protocol. A page can redefine what its own scripts read, such as the window's
// height, and the guest must not take that on trust.
export async function evaluateIsolated(page: Page, script: string): Promise<unknown> {
  const session = await page.context().newCDPSession(page);

  try {
    const treeAnswer = await session.send('Page.getFrameTree');

    const tree = frameTreeSchema.parse(treeAnswer);

    const worldAnswer = await session.send('Page.createIsolatedWorld', {
      frameId: tree.frameTree.frame.id,
      worldName: 'nixie-screen',
    });

    const world = worldSchema.parse(worldAnswer);

    const evaluatedAnswer = await session.send('Runtime.evaluate', {
      expression: script,
      contextId: world.executionContextId,
      returnByValue: true,
    });

    return evaluatedSchema.parse(evaluatedAnswer).result.value;
  } finally {
    await session.detach();
  }
}
