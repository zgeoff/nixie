import { findRuleFileDifference } from './rule-build/find-rule-file-difference';
import { publicRulesPath } from './rule-build/public-rules-path';
import { readPinnedSources } from './rule-build/read-pinned-sources';

const sources = await readPinnedSources();
const committedText = await Bun.file(publicRulesPath).text();

const difference = findRuleFileDifference(committedText, sources.sourceText, sources.licenseText);

if (difference !== null) {
  console.error(`${difference}. Regenerate it with: bun run --cwd libs/secret-scan rules:build`);
  process.exit(1);
}
