import { z } from 'zod';

const headerRecordSchema = z.record(z.string(), z.unknown());

// the header of a sealed spool file as it sits in the file, with no field checked
export function parseSealedHeader(file: Uint8Array): Record<string, unknown> {
  const length = new DataView(file.buffer, file.byteOffset).getUint32(0);
  const text = new TextDecoder().decode(file.subarray(4, 4 + length));

  return headerRecordSchema.parse(JSON.parse(text));
}
