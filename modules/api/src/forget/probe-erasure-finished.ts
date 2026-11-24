// A step that fails leaves the erasure open, and the next start finishes it, so a route's reply
// reports the forget as still deleting.
export async function probeErasureFinished(finish: () => Promise<void>): Promise<boolean> {
  try {
    await finish();

    return true;
  } catch {
    return false;
  }
}
