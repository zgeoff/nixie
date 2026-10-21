import { onTestFinished } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waitFor } from '@testing-library/react';
import { z } from 'zod';

interface BrowserFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface BrowserFilePick {
  readonly selector: string;
  readonly files: readonly BrowserFile[];
  readonly timeoutMs?: number;
}

const nodeReply = z.object({ nodeId: z.int() });
const documentReply = z.object({ root: nodeReply });

export async function setBrowserFiles(view: Bun.WebView, input: BrowserFilePick): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-browser-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await Promise.all(input.files.map((file) => writeFile(join(directory, file.name), file.bytes)));

  await waitFor(
    async () => {
      const found: unknown = await view.evaluate(
        `document.querySelector(${JSON.stringify(input.selector)}) !== null`,
      );

      if (found !== true) {
        throw new Error(`the page shows no ${input.selector}`);
      }
    },
    { timeout: input.timeoutMs ?? 10_000 },
  );

  const root = await view.cdp('DOM.getDocument');

  const document = documentReply.parse(root);

  const found = await view.cdp('DOM.querySelector', {
    nodeId: document.root.nodeId,
    selector: input.selector,
  });

  const node = nodeReply.parse(found);

  await view.cdp('DOM.setFileInputFiles', {
    files: input.files.map((file) => join(directory, file.name)),
    nodeId: node.nodeId,
  });
}
