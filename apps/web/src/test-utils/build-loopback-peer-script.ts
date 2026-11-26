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
    const remote = remotes.get(this) ?? new Peer();
    remotes.set(this, remote);
    await remote.setRemoteDescription(this.localDescription);
    await remote.setLocalDescription(await remote.createAnswer());
    await waitForGathering(remote);
    return applyRemote.call(this, remote.localDescription);
  };
})()`;
}
