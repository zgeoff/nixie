// Stands in for Silero voice activity detection: each segment comes out of the first read after the
// detector has taken in the given number of samples, as Silero closes a segment only once the
// pause after it has run its length.
export function buildStubVad(segments: { closesAfterSamples: number; end: number; start: number }[]): {
  accept: (samples: Float32Array) => void;
  readSegments: () => { end: number; start: number }[];
  reset: () => void;
} {
  let accepted = 0;
  let closed = 0;
  return {
    accept: (samples) => {
      accepted += samples.length;
    },
    readSegments: () => {
      const ready = segments.slice(closed).filter((segment) => segment.closesAfterSamples <= accepted);
      closed += ready.length;
      return ready.map((segment) => ({ end: segment.end, start: segment.start }));
    },
    reset: () => {
      accepted = 0;
      closed = 0;
    },
  };
}
