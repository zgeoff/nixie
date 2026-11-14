const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function isUUIDShaped(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}
