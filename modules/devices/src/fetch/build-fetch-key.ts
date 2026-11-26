// The key of one declared fetch of the content a region shows, in the runner's schedules.
export function buildFetchKey(
  deviceID: string,
  region: string,
  shown: string,
  url: string,
): string {
  return [deviceID, region, shown, url].join('\0');
}
