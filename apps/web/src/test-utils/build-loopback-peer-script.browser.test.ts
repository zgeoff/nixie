import { expect, onTestFinished, test } from 'bun:test';
import { buildLoopbackPeerScript } from './build-loopback-peer-script';
import { waitForPage } from './wait-for-page';

// the page's peer has made its offer, and no answer has come yet
async function setupTest() {
  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');
  await view.evaluate(buildLoopbackPeerScript());

  await view.evaluate(`(async () => {
    window.peer = new RTCPeerConnection();
    window.peer.createDataChannel('events');
    await window.peer.setLocalDescription(await window.peer.createOffer());
  })()`);

  return { view };
}

test('it connects a peer whose offer was answered with a text that the server made up', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate(
    "window.peer.setRemoteDescription({ type: 'answer', sdp: 'not an answer' })",
  );

  await waitForPage(ctx.view, "window.peer.connectionState === 'connected'", 8000);

  const state: unknown = await ctx.view.evaluate('window.peer.connectionState');

  expect(state).toBe('connected');
});

test('it connects a peer again after an ICE-restart offer, with a new answer from its own end', async () => {
  const ctx = await setupTest();

  await ctx.view.evaluate(
    "window.peer.setRemoteDescription({ type: 'answer', sdp: 'not an answer' })",
  );

  await waitForPage(ctx.view, "window.peer.connectionState === 'connected'", 8000);

  const answerIDs: unknown = await ctx.view.evaluate(`(async () => {
    const pick = (peer) => peer.remoteDescription.sdp.match(/a=ice-ufrag:(\\S+)/)[1];
    const first = pick(window.peer);
    await window.peer.setLocalDescription(await window.peer.createOffer({ iceRestart: true }));
    await window.peer.setRemoteDescription({ type: 'answer', sdp: 'not an answer' });
    return JSON.stringify([first === pick(window.peer)]);
  })()`);

  await waitForPage(ctx.view, "window.peer.connectionState === 'connected'", 8000);

  expect(JSON.parse(String(answerIDs))).toStrictEqual([false]);
});

test('it leaves a peer that was never given an answer unconnected', async () => {
  const ctx = await setupTest();
  const state: unknown = await ctx.view.evaluate('window.peer.connectionState');

  expect(state).toBe('new');
});
