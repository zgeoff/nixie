// The bytes of an RFB KeyEvent message, type 4, that presses or releases the key of the keysym.
export function buildKeyEventBytes(keysym: number, isDown: boolean): Uint8Array {
  const bytes = new Uint8Array(8);

  bytes[0] = 4;
  bytes[1] = isDown ? 1 : 0;

  new DataView(bytes.buffer).setUint32(4, keysym);

  return bytes;
}
