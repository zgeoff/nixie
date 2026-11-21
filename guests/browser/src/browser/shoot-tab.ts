import type { ComputerReply } from '@heynixie/wire';
import type { Tab } from './types';

export const viewport = { width: 1280, height: 800 };

export async function shootTab(id: string, tab: Tab): Promise<ComputerReply> {
  const bytes = await tab.page.screenshot({ type: 'png' });

  return {
    kind: 'screenshot',
    ok: true,
    tab: id,
    url: tab.page.url(),
    width: viewport.width,
    height: viewport.height,
    base64: bytes.toString('base64'),
  };
}
