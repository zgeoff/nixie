import type { ImageMediaType } from '@heynixie/contract';

const riff = [0x52, 0x49, 0x46, 0x46];
const webp = [0x57, 0x45, 0x42, 0x50];

interface SignaturePart {
  readonly offset: number;
  readonly bytes: readonly number[];
}

const imageSignatures: readonly {
  readonly mediaType: ImageMediaType;
  readonly parts: readonly SignaturePart[];
}[] = [
  { mediaType: 'image/jpeg', parts: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] },
  {
    mediaType: 'image/png',
    parts: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  },
  { mediaType: 'image/gif', parts: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }] },
  { mediaType: 'image/gif', parts: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }] },
  {
    mediaType: 'image/webp',
    parts: [
      { offset: 0, bytes: riff },
      { offset: 8, bytes: webp },
    ],
  },
];

export function findImageMediaType(bytes: Uint8Array): ImageMediaType | null {
  const signature = imageSignatures.find((candidate) =>
    candidate.parts.every((part) => hasBytesAt(bytes, part.offset, part.bytes)),
  );

  return signature?.mediaType ?? null;
}

function hasBytesAt(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}
