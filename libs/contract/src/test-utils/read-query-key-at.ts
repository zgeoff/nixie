import invariant from 'tiny-invariant';

// The key that the query utils give at a path, which is what the web client invalidates or reads.
export function readQueryKeyAt(utils: object, path: readonly string[]): unknown[] {
  const node = path.reduce<unknown>(
    (current, segment) => (isObjectLike(current) ? Reflect.get(current, segment) : undefined),
    utils,
  );

  invariant(isObjectLike(node), `the utils hold a node at ${path.join('.')}`);

  const key: unknown = Reflect.apply(Reflect.get(node, 'key'), node, []);

  invariant(Array.isArray(key), `the node at ${path.join('.')} gives a key`);

  return key;
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
