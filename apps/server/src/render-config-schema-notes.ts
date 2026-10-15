// The config schema section of a GitHub release body, opened by marker so that a re-run replaces
// it: whether every config.yaml that lastTag accepts still passes, and each change that can refuse
// one. lastTag is null when no earlier release publishes a schema to compare with.
export function renderConfigSchemaNotes(
  breaking: readonly string[],
  lastTag: string | null,
  marker: string,
): string {
  const heading = [marker, '## Config schema', ''];

  if (lastTag === null) {
    return [
      ...heading,
      'This release publishes config.schema.json, and no earlier release publishes one to compare with.',
      '',
    ].join('\n');
  }

  if (breaking.length === 0) {
    return [
      ...heading,
      `Every config.yaml that ${lastTag} accepts passes this release's config.schema.json.`,
      '',
    ].join('\n');
  }

  return [
    ...heading,
    `**Breaking:** this release's config.schema.json can refuse a config.yaml that ${lastTag} accepts:`,
    '',
    ...breaking.map((change) => `- \`${change}\``),
    '',
  ].join('\n');
}
