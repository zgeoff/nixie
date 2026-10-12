// The allow rule lookup until policy ships: no rule of yours exists, so every write runs the full
// gate.
export function findNoAllowRule(): Promise<null> {
  return Promise.resolve(null);
}
