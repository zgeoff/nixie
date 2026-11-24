// A tab that opens its live stream again reads every topic, so a count of opens that has not moved
// shows that what changed on the page came over the stream that was already open.
export function pickLiveOpensRefusal(opened: number, expected: number | undefined): string | null {
  if (expected === undefined || opened === expected) {
    return null;
  }

  return `the browser opened its live stream ${opened} times, not ${expected}`;
}
