// The forms a value takes in a header, a body or an error: as it is, URL-encoded, and as base64 at
// each of the 3 alignments it can take inside a longer base64 text, standard and URL-safe alike.
export function buildValueForms(value: string): readonly string[] {
  const forms = [value, encodeURIComponent(value), ...buildBase64Forms(value)];

  return [...new Set(forms.filter((form) => form !== ''))];
}

const minBase64Chars = 6;
const leadingCharsToSkip = [0, 2, 3] as const;

function buildBase64Forms(value: string): readonly string[] {
  const bytes = Buffer.from(value, 'utf8');

  return leadingCharsToSkip.flatMap((skip, offset) => {
    const padded = Buffer.concat([Buffer.alloc(offset, 0x41), bytes]);
    const isPartialTail = padded.byteLength % 3 !== 0;
    const encoded = padded.toString('base64').replace(/=+$/u, '');
    const end = isPartialTail ? -1 : undefined;
    const complete = encoded.slice(skip, end);

    if (complete.length < minBase64Chars) {
      return [];
    }

    return [complete, complete.replaceAll('+', '-').replaceAll('/', '_')];
  });
}
