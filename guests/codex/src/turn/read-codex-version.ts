import { $ } from 'bun';

// What `codex --version` prints, such as codex-cli 0.166.0
export async function readCodexVersion(env: Record<string, string>): Promise<string> {
  const printed = await $`codex --version`.env(env).text();

  return printed.trim();
}
