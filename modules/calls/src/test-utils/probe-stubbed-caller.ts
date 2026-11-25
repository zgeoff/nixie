// A caller probe for a session that stays live.
export function probeStubbedCaller(): Promise<boolean> {
  return Promise.resolve(true);
}
