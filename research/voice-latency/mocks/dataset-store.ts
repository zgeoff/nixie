const rows = new Map<string, unknown[]>();
const audio = new Map<string, Uint8Array>();

// The Hugging Face dataset server's state for the MSW handlers: each dataset's test rows, and the
// recording at each audio URL. The test preload resets it after each test.
export const datasetStore = {
  audio,
  reset: () => {
    rows.clear();
    audio.clear();
  },
  rows,
};
