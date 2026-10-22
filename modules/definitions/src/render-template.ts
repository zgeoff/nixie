import invariant from 'tiny-invariant';
import { templatePlaceholderPattern } from './template-placeholder-pattern';

export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replaceAll(templatePlaceholderPattern, (placeholder) => {
    const value = values[placeholder.slice(1, -1)];

    invariant(value !== undefined, `the template holds the unchecked placeholder ${placeholder}`);

    return value;
  });
}
