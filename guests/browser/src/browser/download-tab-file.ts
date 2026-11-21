import { readFile } from 'node:fs/promises';
import type { ComputerReply } from '@heynixie/wire';
import type { Download, Locator } from 'playwright-core';
import type { Tab } from './types';

const downloadLimitBytes = 25 * 1024 * 1024;

// Clicks a control and waits for the download it starts. The reply holds the file's bytes, which the
// server copies into the shell.
export async function downloadTabFile(tab: Tab, element: string): Promise<ComputerReply> {
  const locator = tab.page.locator(`[data-nixie-e="${element.replaceAll(/[^A-Za-z0-9]/gu, '')}"]`);

  const count = await locator.count();

  if (count !== 1) {
    return { kind: 'failed', ok: false, reason: 'stale_element' };
  }

  const download = await clickForDownload(tab, locator);

  if (download === null) {
    return { kind: 'failed', ok: false, reason: 'no_download' };
  }

  const path = await download.path();
  const bytes = await readFile(path);

  if (bytes.byteLength > downloadLimitBytes) {
    return { kind: 'failed', ok: false, reason: 'too_big' };
  }

  const name = download.suggestedFilename().replaceAll(/[\\/\0]/gu, '_') || 'download';

  return { kind: 'file', ok: true, name, base64: bytes.toString('base64'), isDiskNew: false };
}

const downloadWaitMs = 30_000;

async function clickForDownload(tab: Tab, locator: Locator): Promise<Download | null> {
  const waiting = tab.page.waitForEvent('download', { timeout: downloadWaitMs });

  try {
    await locator.click({ timeout: 10_000, noWaitAfter: true });

    return await waiting;
  } catch {
    return null;
  }
}
