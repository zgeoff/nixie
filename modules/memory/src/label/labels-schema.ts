import { z } from 'zod';

const lineBreak = /[\n\r\u2028\u2029]/u;

export const labelsSchema = z.strictObject({
  gist: buildLine(1, 80),
  topic: buildLine(1, 40),
  triggers: z.array(buildLine(1, 60)).max(5),
});

function buildLine(minLength: number, maxLength: number) {
  return z.string().refine(
    (value) => {
      const length = [...value].length;

      return length >= minLength && length <= maxLength && !lineBreak.test(value);
    },
    { message: `must be one line of ${String(minLength)} to ${String(maxLength)} characters` },
  );
}
