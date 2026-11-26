// A member of a value that Google's script put on the page, which nothing in the build types. A
// value that is no object has no member.
export function readGoogleMember(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, name) : undefined;
}
