export function collectJourneyBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```bash\n(?<commands>[\s\S]*?)```/gu)].map(
    (match) => match.groups?.['commands'] ?? '',
  );
}
