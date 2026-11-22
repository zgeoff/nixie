// The server sends each RFB message as one chunk, and no message but a key event, of 8 bytes that
// start with 4, and a pointer event, of 6 bytes that start with 5, has either shape.
export function isInputMessage(bytes: Uint8Array): boolean {
  return (bytes[0] === 4 && bytes.byteLength === 8) || (bytes[0] === 5 && bytes.byteLength === 6);
}
