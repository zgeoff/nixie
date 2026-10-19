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
  // the CSS selector of the file input
  readonly selector: string;
  readonly files: readonly BrowserFile[];
  readonly timeoutMs?: number;
}

// Sets files on the page's file input as a pick in the browser's file dialog does, once the page
// shows the input. Chrome reads each file from disk, so the files go in a directory that the test
// removes when it finishes.
export async function setBrowserFiles(view: Bun.WebView, input: BrowserFilePick): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-browser-files-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  await Promise.all(input.files.map((file) => writeFile(join(dir, file.name), file.bytes)));

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
    files: input.files.map((file) => join(dir, file.name)),
    nodeId: node.nodeId,
  });
}

// the parts of the DevTools replies the helper reads, which Bun's types leave unknown
const nodeReply = z.object({ nodeId: z.int() });
const documentReply = z.object({ root: nodeReply });
