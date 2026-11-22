import type { ComputerReply } from '@heynixie/wire';
import { toSelector } from './act-on-tab';
import type { Tab } from './types';

// The viewport's picture, or the box of one control when a control is named. A control that no
// longer holds its number is stale.
export async function shootTab(
  id: string,
  tab: Tab,
  control: string | undefined,
): Promise<ComputerReply> {
  const picture = await takePicture(tab, control);

  if (picture === null) {
    return { kind: 'failed', ok: false, reason: 'stale_element' };
  }

  return {
    kind: 'screenshot',
    ok: true,
    tab: id,
    url: tab.page.url(),
    width: picture.width,
    height: picture.height,
    base64: picture.bytes.toString('base64'),
  };
}

export const viewport = { width: 1280, height: 800 };

interface Picture {
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
}

async function takePicture(tab: Tab, control: string | undefined): Promise<Picture | null> {
  if (control === undefined) {
    return { bytes: await tab.page.screenshot({ type: 'png' }), ...viewport };
  }

  const locator = tab.page.locator(toSelector(control));

  if ((await locator.count()) !== 1) {
    return null;
  }

  const box = await locator.boundingBox({ timeout: 10_000 });

  if (box === null) {
    return null;
  }

  const bytes = await locator.screenshot({ type: 'png', timeout: 10_000 });

  return { bytes, width: Math.round(box.width), height: Math.round(box.height) };
}
