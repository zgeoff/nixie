import type { ContentSource } from '@heynixie/log';

// The least trusted of the sources a merged text came from, so a merge never relabels outside
// content as your words: untrusted over your data, and your data over your own words.
export function pickLeastTrustedSource(sources: readonly ContentSource[]): ContentSource {
  if (sources.includes('untrusted')) {
    return 'untrusted';
  }

  return sources.includes('owner_data') ? 'owner_data' : 'owner';
}
