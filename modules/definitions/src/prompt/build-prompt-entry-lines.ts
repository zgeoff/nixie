export function buildPromptEntryLines(
  promptID: string,
  entry: Readonly<Record<string, string>>,
  indent: string,
): readonly string[] {
  const valueIndent = `${indent}  `;
  const lines = [`${indent}${promptID}:`];

  for (const [key, value] of Object.entries(entry)) {
    // A YAML literal block turns each CRLF into LF and cannot hold edge whitespace as written.
    if (!value.includes('\n') || /^\s|\s$|\r/u.test(value)) {
      lines.push(`${valueIndent}${key}: ${JSON.stringify(value)}`);
      continue;
    }

    lines.push(`${valueIndent}${key}: |-`);

    for (const line of value.split('\n')) {
      const indented = line === '' ? '' : `${valueIndent}  ${line}`;

      lines.push(indented);
    }
  }

  return lines;
}
