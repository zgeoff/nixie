import invariant from 'tiny-invariant';

export function fillTemplate(template: string, values: ReadonlyMap<string, string>): string {
  return template.replaceAll(/\{\{(?<path>.*?)\}\}/gu, (_match, inner: string) => {
    const path = inner.trim();
    const value = values.get(path);

    invariant(value !== undefined, `the prompt accepts no path "${path}"`);

    return value;
  });
}
