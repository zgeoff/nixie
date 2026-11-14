const messagePrefix = 'task-message-';

export function parseLinkedMessage(hash: string): string | undefined {
  const messageID = hash.startsWith(messagePrefix) ? hash.slice(messagePrefix.length) : '';

  return messageID === '' ? undefined : messageID;
}
