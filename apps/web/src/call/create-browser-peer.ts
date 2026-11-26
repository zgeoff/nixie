import type { CallMicrophone, CallPeer, CallTrack, OfferOptions } from './call-environment';

// The call's peer connection in the browser, with a data channel for the speech layer's events.
export function createBrowserPeer(): CallPeer {
  const connection = new RTCPeerConnection();

  connection.createDataChannel('oai-events');

  return {
    readConnectionState: () => connection.connectionState,
    addTrack: (track: CallTrack, stream: CallMicrophone) => {
      const mediaTrack = toMediaTrack(track);
      const mediaStream = toMediaStream(stream);

      if (mediaTrack !== null && mediaStream !== null) {
        connection.addTrack(mediaTrack, mediaStream);
      }
    },
    makeOffer: async (options: OfferOptions) => {
      const offer = await connection.createOffer({ iceRestart: options.isRestart });

      await connection.setLocalDescription(offer);

      await waitForGathering(connection);

      return connection.localDescription?.sdp ?? '';
    },
    applyAnswer: (sdp) => connection.setRemoteDescription({ type: 'answer', sdp }),
    dropOffer: () => connection.setLocalDescription({ type: 'rollback' }),
    onSpeech: (listener) => {
      connection.addEventListener('track', (event) => {
        const [stream] = event.streams;

        if (stream !== undefined) {
          listener(stream);
        }
      });
    },
    onConnectionState: (listener) => {
      connection.addEventListener('connectionstatechange', () => {
        listener(connection.connectionState);
      });
    },
    close: () => {
      connection.close();
    },
  };
}

function toMediaTrack(track: CallTrack): MediaStreamTrack | null {
  return track instanceof MediaStreamTrack ? track : null;
}

function toMediaStream(stream: CallMicrophone): MediaStream | null {
  return stream instanceof MediaStream ? stream : null;
}

// how long an offer waits for the connection to gather its network addresses
const gatherLimitMs = 3000;

function waitForGathering(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);

      connection.removeEventListener('icegatheringstatechange', check);

      resolve();
    };

    const check = (): void => {
      if (connection.iceGatheringState === 'complete') {
        finish();
      }
    };

    const timer = setTimeout(finish, gatherLimitMs);

    connection.addEventListener('icegatheringstatechange', check);
  });
}
