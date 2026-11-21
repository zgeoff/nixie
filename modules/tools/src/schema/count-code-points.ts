// Ajv counts a limit in code points, so a character outside the basic plane counts once.
export function countCodePoints(text: string): number {
  return text.match(/./gsu)?.length ?? 0;
}
