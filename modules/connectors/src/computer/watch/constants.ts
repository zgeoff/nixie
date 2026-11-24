export const rawEncoding = 0;
export const copyRectEncoding = 1;
export const zrleEncoding = 16;
export const desktopSizeEncoding = -223;
export const cursorEncoding = -239;

// The encodings a viewer may ask for, which are the ones whose size the filter can read without
// decoding: Raw, CopyRect, ZRLE, which leads with its length, and the two pseudo-encodings that a
// viewer needs to draw the desktop. The client filter cuts every other one from a viewer's list.
export const framedEncodings: readonly number[] = [
  rawEncoding,
  copyRectEncoding,
  zrleEncoding,
  desktopSizeEncoding,
  cursorEncoding,
];
