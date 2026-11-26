export interface FakeMicrophoneScriptOptions {
  // allow gives the page a silent microphone, and block refuses it as a user's block does
  readonly answer: 'allow' | 'block';
}

// The script that stands in for the microphone in a browser that has none. It leaves each request's
// constraints in `window.microphoneRequests`, for a test to read.
export function buildFakeMicrophoneScript(options: FakeMicrophoneScriptOptions): string {
  return `(() => {
  window.microphoneRequests = [];
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    window.microphoneRequests.push(JSON.stringify(constraints));
    if (${JSON.stringify(options.answer)} === 'block') {
      throw new DOMException('Permission denied', 'NotAllowedError');
    }
    return new AudioContext().createMediaStreamDestination().stream;
  };
})();`;
}
