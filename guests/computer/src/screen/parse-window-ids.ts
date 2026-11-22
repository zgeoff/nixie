// Reads the window IDs that xprop prints for a window list, such as
// `_NET_CLIENT_LIST_STACKING(WINDOW): window id # 0x400003, 0x200004`, in order. An unset property
// gives none.
export function parseWindowIDs(output: string): string[] {
  return [...output.matchAll(/0x[0-9a-f]+/giu)].map((found) => found[0].toLowerCase());
}
