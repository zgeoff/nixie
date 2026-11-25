// The carrying device: headless Chromium on a local page that holds a real WebRTC peer connection.
// The runner plays synthetic speech into its microphone and reads what its data channel received.
import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import { z } from 'zod';

export interface Device {
  applyAnswer: (sdp: string) => Promise<void>;
  close: () => Promise<void>;
  createOffer: () => Promise<string>;
  // A new offer from the same peer connection, with fresh ICE credentials.
  createRestartOffer: () => Promise<string>;
  readChannelEvents: () => Promise<ChannelEntry[]>;
  readPeerState: () => Promise<string>;
  readPlayback: () => Promise<PlaybackLevel[]>;
  sendOnChannel: (event: Record<string, unknown>) => Promise<void>;
  // Plays mono PCM16 at 24 kHz into the microphone, and resolves when it has played.
  speak: (pcmBase64: string) => Promise<{ endedAtMs: number; startedAtMs: number }>;
}

const channelEntry = z.object({
  atMs: z.number(),
  event: z.record(z.string(), z.unknown()).optional(),
  source: z.string(),
  state: z.string().optional(),
});

export type ChannelEntry = z.infer<typeof channelEntry>;

const playbackLevel = z.object({ atMs: z.number(), peak: z.number() });

export type PlaybackLevel = z.infer<typeof playbackLevel>;

const spoken = z.object({ endedAtMs: z.number(), startedAtMs: z.number() });

export async function startDevice(): Promise<Device> {
  const server = Bun.serve({ port: 0, fetch: answerPageRequest });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.port}/`);
  return buildDevice(page, browser, server);
}

function answerPageRequest(): Response {
  return new Response(Bun.file(new URL('./device.html', import.meta.url).pathname), {
    headers: { 'content-type': 'text/html' },
  });
}

function buildDevice(page: Page, browser: Browser, server: { stop: () => void }): Device {
  const callPage = async (expression: string, argument?: unknown): Promise<unknown> =>
    page.evaluate(([body, value]) => new Function('value', `return ${String(body)}`)(value), [expression, argument]);
  return {
    applyAnswer: async (sdp) => {
      await callPage('window.applyAnswer(value)', sdp);
    },
    close: async () => {
      await callPage('window.closePeer()');
      await browser.close();
      server.stop();
    },
    createOffer: async () => z.string().parse(await callPage('window.createOffer()')),
    createRestartOffer: async () => z.string().parse(await callPage('window.createRestartOffer()')),
    readChannelEvents: async () => z.array(channelEntry).parse(await callPage('window.device.events')),
    readPeerState: async () => z.string().parse(await callPage('window.device.peer.connectionState')),
    readPlayback: async () => z.array(playbackLevel).parse(await callPage('window.device.levels')),
    sendOnChannel: async (event) => {
      await callPage('window.sendOnChannel(value)', event);
    },
    speak: async (pcmBase64) => spoken.parse(await callPage('window.speak(value)', pcmBase64)),
  };
}
