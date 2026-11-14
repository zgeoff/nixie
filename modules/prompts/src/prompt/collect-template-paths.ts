import { templatePathPattern } from './template-path-pattern';

export function collectTemplatePaths(template: string): readonly string[] {
  return [...template.matchAll(templatePathPattern)].map((match) => (match[1] ?? '').trim());
}
