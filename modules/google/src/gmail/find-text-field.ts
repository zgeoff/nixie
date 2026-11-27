// A field of a call's input when it is text, and undefined when it is anything else.
export function findTextField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
