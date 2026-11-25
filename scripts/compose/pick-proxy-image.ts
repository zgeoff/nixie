export function pickProxyImage(composeText: string): string | null {
  const found = /^\s*image:\s*(?<image>caddy:\S+)\s*$/mu.exec(composeText);

  return found?.groups?.['image'] ?? null;
}
