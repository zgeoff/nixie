import { pinnedSource } from './pinned-source';

export interface PinnedSources {
  sourceText: string;
  licenseText: string;
}

// Downloads the upstream rule file and its licence at the pinned commit, and throws when the rule
// file's SHA-256 is not the pinned one.
export async function readPinnedSources(): Promise<PinnedSources> {
  const [sourceText, licenseText] = await Promise.all([
    readRawFile(pinnedSource.rulesPath),
    readRawFile(pinnedSource.licensePath),
  ]);

  const hash = new Bun.CryptoHasher('sha256').update(sourceText).digest('hex');

  if (hash !== pinnedSource.rulesSha256) {
    throw new Error(
      `${pinnedSource.rulesPath} at ${pinnedSource.commit} has SHA-256 ${hash}, not the pinned ${pinnedSource.rulesSha256}`,
    );
  }

  return { sourceText, licenseText };
}

async function readRawFile(path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${pinnedSource.repository}/${pinnedSource.commit}/${path}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }

  return response.text();
}
