import { mintBlockID } from '@heynixie/wire';

export function renderTaskMessageElement(
  attributes: readonly (readonly [string, string])[],
  lines: readonly string[],
): string {
  // The body is another model's text, so a fresh random ID that the body cannot guess closes the
  // block.
  const blockID = mintBlockID();

  const opening = [...attributes, ['block', blockID] as const].map(
    ([name, value]) => `${name}="${escapeAttribute(value)}"`,
  );

  return [
    `<task-message ${opening.join(' ')}>`,
    ...lines,
    `</task-message block="${blockID}">`,
  ].join('\n');
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
