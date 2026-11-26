import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { buildLoopbackPeerScript } from '../test-utils/build-loopback-peer-script';
import { waitForPage } from '../test-utils/wait-for-page';

// the page holds the adapter as the web build bundles it, and one peer that carries a microphone
async function setupTest() {
  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  const adapterPath = join(import.meta.dir, 'create-browser-peer.ts');

  const built = await Bun.build({
    entrypoints: ['entry.ts'],
    files: {
      'entry.ts': `import { createBrowserPeer } from ${JSON.stringify(adapterPath)};
window.createBrowserPeer = createBrowserPeer;`,
    },
    format: 'iife',
    target: 'browser',
  });

  const [output] = built.outputs;

  invariant(output !== undefined, 'the adapter bundles');

  const bundle = await output.text();

  await view.navigate('about:blank');
  await view.evaluate(buildLoopbackPeerScript());

  // evaluate takes one expression, so the bundle's closing semicolon goes
  await view.evaluate(bundle.trim().replace(/;$/u, ''));

  await view.evaluate(`(() => {
    window.states = [];
    window.peer = window.createBrowserPeer();
    window.peer.onConnectionState((state) => window.states.push(state));
    const microphone = new AudioContext().createMediaStreamDestination().stream;
    for (const track of microphone.getTracks()) window.peer.addTrack(track, microphone);
  })()`);

  return { view };
}

test('#createBrowserPeer makes an offer that carries the microphone, the events channel and the gathered addresses', async () => {
  const ctx = await setupTest();
  const offer = await ctx.view.evaluate('window.peer.makeOffer({ isRestart: false })');

  const sdp = String(offer);

  expect({
    hasAudio: sdp.includes('m=audio'),
    hasEvents: sdp.includes('m=application'),
    hasAddresses: sdp.includes('a=candidate'),
  }).toStrictEqual({ hasAudio: true, hasEvents: true, hasAddresses: true });
});

test('#createBrowserPeer connects once the answer is applied, and reports the states on the way', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate(
    "(async () => { await window.peer.makeOffer({ isRestart: false }); await window.peer.applyAnswer('an answer'); })()",
  );

  await waitForPage(ctx.view, "window.peer.readConnectionState() === 'connected'", 8000);

  const last: unknown = await ctx.view.evaluate('window.states.at(-1)');

  expect(last).toBe('connected');
});

test('#createBrowserPeer makes a restart offer with new connection credentials on the same peer connection', async () => {
  const ctx = await setupTest();

  const credentials = await ctx.view.evaluate(`(async () => {
    const first = await window.peer.makeOffer({ isRestart: false });
    await window.peer.applyAnswer('an answer');
    const second = await window.peer.makeOffer({ isRestart: true });
    const pick = (sdp) => sdp.match(/a=ice-ufrag:(\\S+)/)[1];
    return JSON.stringify([pick(first) === pick(second)]);
  })()`);

  expect(JSON.parse(String(credentials))).toStrictEqual([false]);
});

test('#createBrowserPeer closes the connection', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate('window.peer.close()');

  const state: unknown = await ctx.view.evaluate('window.peer.readConnectionState()');

  expect(state).toBe('closed');
});
