// The forms a value takes in a header, a body or an error: as it is, URL-encoded in each way a
// sender writes it, and as base64 at each of the 3 alignments it can take inside a longer base64
// text, standard and URL-safe alike.
export function buildValueForms(value: string): readonly string[] {
  const forms = [value, ...buildPercentForms(value), ...buildBase64Forms(value)];

  return [...new Set(forms.filter((form) => form !== ''))];
}

// encodeURIComponent writes upper-case hex and leaves !'()* bare. Another sender writes lower-case
// hex, escapes those 5 characters, or writes a space as a plus.
function buildPercentForms(value: string): readonly string[] {
  const standard = encodeURIComponent(value);

  const strict = standard.replaceAll(
    /[!'()*]/gu,
    (character) => `%${(character.codePointAt(0) ?? 0).toString(16).toUpperCase()}`,
  );

  return [standard, strict].flatMap((form) => {
    const lower = form.replaceAll(/%[\dA-F]{2}/gu, (escape) => escape.toLowerCase());

    return [form, lower, form.replaceAll('%20', '+'), lower.replaceAll('%20', '+')];
  });
}

const leadingCharsToSkip = [0, 2, 3] as const;

function buildBase64Forms(value: string): readonly string[] {
  const bytes = Buffer.from(value, 'utf8');

  return leadingCharsToSkip.flatMap((skip, offset) => {
    const padded = Buffer.concat([Buffer.alloc(offset, 0x41), bytes]);
    const isPartialTail = padded.byteLength % 3 !== 0;
    const encoded = padded.toString('base64').replace(/=+$/u, '');
    const end = isPartialTail ? -1 : undefined;
    const complete = encoded.slice(skip, end);

    if (complete === '') {
      return [];
    }

    return [complete, complete.replaceAll('+', '-').replaceAll('/', '_')];
  });
}
