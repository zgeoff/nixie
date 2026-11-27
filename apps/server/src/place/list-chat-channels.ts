// The chat channel that each feature that is on names, so a handle such as `<channel>:<id>` parses
// as a place. Core owns this list and names no feature: a chat feature adds its channel here when
// the composition root starts it.
export function listChatChannels(): readonly string[] {
  return [];
}
