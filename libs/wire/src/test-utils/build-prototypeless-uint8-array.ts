// A Uint8Array constructor that still builds arrays, but reads every property, its prototype
// included, as null, so spying on one of its methods throws.
export function buildPrototypelessUint8Array(real: Uint8ArrayConstructor): Uint8ArrayConstructor {
  return new Proxy(real, {
    construct: (target, args: unknown[]) => Reflect.construct(target, args, target),
    get: findNoProperty,
  });
}

function findNoProperty(): null {
  return null;
}
