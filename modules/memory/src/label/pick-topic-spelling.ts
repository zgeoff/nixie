// Two topics that differ only by case are one topic, so a write takes the spelling of a topic that
// another item already holds.
export function pickTopicSpelling(topic: string, existing: readonly string[]): string {
  const folded = topic.toLowerCase();

  return existing.find((candidate) => candidate.toLowerCase() === folded) ?? topic;
}
