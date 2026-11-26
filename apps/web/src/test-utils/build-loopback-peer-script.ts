// The script that stands in for the speech layer's end of a call's peer connection. The fake speech
// layer answers with text only, so the page applies the answer of a second peer inside the page
// instead, and its own peer connects only when its offer, addresses and keys really work.
export function buildLoopbackPeerScript(): string {
  return `(() => {
  const Peer = window.RTCPeerConnection;
  const applyRemote = Peer.prototype.setRemoteDescription;
  const remotes = new WeakMap();

  const waitForGathering = (peer) => new Promise((resolve) => {
    if (peer.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 3000);
    peer.addEventListener('icegatheringstatechange', () => {
      if (peer.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  Peer.prototype.setRemoteDescription = async function (description) {
    if (description.type !== 'answer') {
      return applyRemote.call(this, description);
    }
    const isRestart = remotes.has(this);
    const remote = remotes.get(this) ?? new Peer();
    remotes.set(this, remote);
    await remote.setRemoteDescription(this.localDescription);
    await remote.setLocalDescription(await remote.createAnswer());
    await waitForGathering(remote);
    const applied = await applyRemote.call(this, remote.localDescription);
    // a real network loss moves the state off connected and back, and a loopback never loses its
    // network, so the page reports the change that a restart's recovery would bring
    if (isRestart) {
      setTimeout(() => this.dispatchEvent(new Event('connectionstatechange')), 0);
    }
    return applied;
  };
})()`;
}
