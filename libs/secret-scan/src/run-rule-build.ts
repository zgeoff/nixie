import { buildRuleFile } from './rule-build/build-rule-file';
import { publicRulesPath } from './rule-build/public-rules-path';
import { readPinnedSources } from './rule-build/read-pinned-sources';

const sources = await readPinnedSources();

await Bun.write(publicRulesPath, buildRuleFile(sources.sourceText, sources.licenseText));
