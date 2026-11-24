import type { ComputerReply } from '@heynixie/wire';
import { z } from 'zod';
import { buildSnapshotScript } from './build-snapshot-script';
import { probeChallenge } from './probe-challenge';
import type { Tab } from './types';

const pageSchema = z.object({
  title: z.string(),
  text: z.string(),
  links: z.array(z.string()),
  url: z.string(),
});

export interface ReadOptions {
  readonly mode: 'text' | 'snapshot';
  readonly textBytes: number;
  readonly isDiskNew: boolean;

  // why the navigation that loaded the page was a bot protection's answer, or null
  readonly blocked: string | null;
}

type PageReply = Extract<ComputerReply, { kind: 'page' }>;

// The tab's page as text, with link marks, and in snapshot mode with its controls numbered. The
// text stops at `textBytes`, and a link mark that the cut leaves open is the reader's to drop.
export async function readTabPage(id: string, tab: Tab, options: ReadOptions): Promise<PageReply> {
  const json: unknown = await tab.page.evaluate(buildSnapshotScript(options.mode));

  const page = pageSchema.parse(JSON.parse(String(json)));
  const text = Buffer.from(page.text).subarray(0, options.textBytes).toString('utf8');

  return {
    kind: 'page',
    ok: true,
    tab: id,
    page: { url: page.url, status: tab.status, title: page.title, text, links: page.links },
    isDiskNew: options.isDiskNew,
    hasChallenge: await probeChallenge(tab.page),
    blocked: options.blocked,
  };
}
