import { pickRuleAliasTool } from '../memory/pick-rule-alias-tool';
import type { Rule } from '../types';

// A pattern such as * matches every tool, so only the exact name, or the name of the tool whose
// rules also cover this one, lets a rule speak for the tool.
export function isToolNamed(rule: Rule, tool: string): boolean {
  const alias = pickRuleAliasTool(tool);

  return (
    rule.tools?.includes(tool) === true || (alias !== null && rule.tools?.includes(alias) === true)
  );
}
