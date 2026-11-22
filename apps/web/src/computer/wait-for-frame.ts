const pollMs = 50;

// Calls onFrame once, when the canvas inside the element shows a picture. It returns the function
// that stops the wait.
export function waitForFrame(target: HTMLElement, onFrame: () => void): () => void {
  const timer = setInterval(() => {
    if (isFrameDrawn(target)) {
      clearInterval(timer);
      onFrame();
    }
  }, pollMs);

  return () => {
    clearInterval(timer);
  };
}

// noVNC fires connect after the server's init message, before any picture, and it clears the canvas
// to transparent. A drawn rectangle has an opaque pixel, so the wait looks at a few points of the
// canvas for one.
const samplePoints = [
  [0.5, 0.5],
  [0.1, 0.1],
  [0.9, 0.1],
  [0.1, 0.9],
  [0.9, 0.9],
] as const;

function isFrameDrawn(target: HTMLElement): boolean {
  const canvas = target.querySelector('canvas');
  const context = canvas?.getContext('2d');

  if (canvas === null || canvas === undefined || context === null || context === undefined) {
    return false;
  }

  if (canvas.width === 0 || canvas.height === 0) {
    return false;
  }

  return samplePoints.some(([across, down]) => {
    const x = Math.min(canvas.width - 1, Math.floor(canvas.width * across));
    const y = Math.min(canvas.height - 1, Math.floor(canvas.height * down));

    return (context.getImageData(x, y, 1, 1).data[3] ?? 0) > 0;
  });
}
