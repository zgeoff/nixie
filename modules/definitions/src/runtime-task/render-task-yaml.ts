// The text of a task.yaml for a task mapping: block-style YAML that ends in one newline, which the
// definitions repo's format check accepts as it is.
export function renderTaskYAML(mapping: Readonly<Record<string, unknown>>): string {
  return `${Bun.YAML.stringify(mapping, null, 2).replace(/\n+$/u, '')}\n`;
}
