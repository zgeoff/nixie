import { parseWindowIDs } from './parse-window-ids';

// Reads `_NET_ACTIVE_WINDOW(WINDOW): window id # 0x400003`. The ID 0x0 and an unset property mean
// no window.
export function parseActiveWindow(output: string): string | null {
  const [id] = parseWindowIDs(output);

  return id === undefined || BigInt(id) === 0n ? null : id;
}
