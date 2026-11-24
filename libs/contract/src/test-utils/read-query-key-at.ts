// The key that the query utils give at a path, which is what the web client invalidates or reads.
export function readQueryKeyAt(utils: object, path: readonly string[]): unknown[] {
  const node = path.reduce<unknown>(
    (current, segment) => (isObjectLike(current) ? Reflect.get(current, segment) : undefined),
    utils,
  );

  // The published contract takes no assertion library, so the checks throw plain errors.
  if (!isObjectLike(node)) {
    throw new TypeError(`the utils hold no node at ${path.join('.')}`);
  }

  const key: unknown = Reflect.apply(Reflect.get(node, 'key'), node, []);

  if (!Array.isArray(key)) {
    throw new TypeError(`the node at ${path.join('.')} gives no key`);
  }

  return key;
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
