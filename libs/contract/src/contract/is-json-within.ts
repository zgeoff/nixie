// JSON the size limit holds, measured as the bytes of its text
export function isJSONWithin(value: unknown, limitBytes: number): boolean {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= limitBytes;
}
