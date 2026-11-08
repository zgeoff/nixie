import invariant from 'tiny-invariant';

// A Uint8Array constructor that still builds arrays, but reads every property, its prototype
// included, as null, so spying on one of its methods throws.
export function buildPrototypelessUint8Array(real: Uint8ArrayConstructor): Uint8ArrayConstructor {
  return new Proxy(real, {
    construct: (target, args: unknown[]) => {
      const created: unknown = Reflect.construct(target, args, target);

      invariant(created instanceof real);

      return created;
    },
    get: findNoProperty,
  });
}

function findNoProperty(): null {
  return null;
}
