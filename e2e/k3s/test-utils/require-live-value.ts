// Returns a live check's value, and throws with the variable that sets it when the value is null.
// A suite skips unless its values are set, so the throw marks a suite that ran without them.
export function requireLiveValue<T>(value: T | null, variable: string): T {
  if (value === null) {
    throw new Error(`the live check needs ${variable}`);
  }
  return value;
}
