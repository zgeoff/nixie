import type { ContentSource } from '@heynixie/log';

export function pickLeastTrustedSource(sources: readonly ContentSource[]): ContentSource {
  if (sources.includes('untrusted')) {
    return 'untrusted';
  }

  return sources.includes('owner_data') ? 'owner_data' : 'owner';
}
