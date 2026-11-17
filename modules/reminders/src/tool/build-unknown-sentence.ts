export function buildUnknownSentence(shortID: string): string {
  return `No reminder has the ID ${shortID}. Call reminders.list to see the IDs.`;
}
