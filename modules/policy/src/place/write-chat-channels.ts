// The chat connector names that a handle can name. Core owns this list and names no feature: the
// composition root fills it with the channel of each chat feature that is on, before any place is
// parsed.
let channels: ReadonlySet<string> = new Set();

export function writeChatChannels(names: readonly string[]): void {
  channels = new Set(names);
}

export function isChatChannel(name: string): boolean {
  return channels.has(name);
}
