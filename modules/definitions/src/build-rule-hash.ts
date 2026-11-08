import type { RuleForm } from '@heynixie/policy';
import { buildSHA256 } from './build-sha256';
import { toCanonicalJSON } from './to-canonical-json';

export function buildRuleHash(rule: RuleForm): string {
  return buildSHA256(toCanonicalJSON(rule));
}
