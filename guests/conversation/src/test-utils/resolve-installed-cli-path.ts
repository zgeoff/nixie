import { fileURLToPath } from 'node:url';

class InstalledCLINotFoundError extends Error {
  constructor(candidates: readonly string[]) {
    super(`no Agent SDK platform package resolves: ${candidates.join(', ')}`);

    this.name = 'InstalledCLINotFoundError';
  }
}

// The SDK looks for its CLI the same way, from its own module URL, so the lookup follows the
// package links of the install that the guest runs on.
export function resolveInstalledCLIPath(): string {
  const sdkURL = import.meta.resolve('@anthropic-ai/claude-agent-sdk');
  const candidates = collectCLICandidates(process.platform, process.arch, isGlibc());

  for (const candidate of candidates) {
    try {
      return fileURLToPath(import.meta.resolve(candidate, sdkURL));
    } catch {
      // try the next platform package
    }
  }

  throw new InstalledCLINotFoundError(candidates);
}

export function collectCLICandidates(
  platform: string,
  arch: string,
  isGlibcRuntime: boolean,
): string[] {
  const base = `@anthropic-ai/claude-agent-sdk-${platform}-${arch}`;

  if (platform !== 'linux') {
    return [`${base}/claude`];
  }

  return isGlibcRuntime
    ? [`${base}/claude`, `${base}-musl/claude`]
    : [`${base}-musl/claude`, `${base}/claude`];
}

function isGlibc(): boolean {
  const report: unknown = process.report.getReport();

  return (
    typeof report === 'object' &&
    report !== null &&
    'header' in report &&
    typeof report.header === 'object' &&
    report.header !== null &&
    'glibcVersionRuntime' in report.header &&
    report.header.glibcVersionRuntime !== undefined
  );
}
