// Writes one framed request for a guest, as the host sends it: a 4-byte big-endian length, then
// the JSON. Usage: write-frame.ts fetch <url> <path> | check <model> <path>
const deniedRanges = [
  '10.0.0.0/8',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10',
];

const [kind, value, path] = process.argv.slice(2);

if (value === undefined || path === undefined || (kind !== 'fetch' && kind !== 'check')) {
  throw new Error('usage: write-frame.ts fetch <url> <path> | check <model> <path>');
}

const request = kind === 'fetch' ? buildFetchRequest(value) : buildCheckRequest(value);
const body = new TextEncoder().encode(JSON.stringify(request));
const frame = new Uint8Array(4 + body.length);

new DataView(frame.buffer).setUint32(0, body.length);
frame.set(body, 4);

await Bun.write(path, frame);

// The text limit is 20 times nixie's default, so the reply holds the whole readable page.
function buildFetchRequest(url: string): object {
  return {
    url,
    limits: {
      bodyBytes: 2_097_152,
      timeoutMs: 15_000,
      redirects: 5,
      textBytes: 400_000,
      imageBytes: 2_097_152,
    },
    deniedRanges,
  };
}

function buildCheckRequest(model: string): object {
  const lines = Array.from(
    { length: 4000 },
    (_, index) => `Line ${index}: the ferry left pier ${index % 9} with ${index % 31} crates.`,
  );

  return {
    profile: { model, baseURL: 'https://api.anthropic.com', effort: 'low', authHeader: 'bearer' },
    systemPrompt:
      'Decide whether the user asserted the claim in the transcript. Give the verdict and one short reason.',
    input: `${lines.join('\n')}\n\nUser: I told you the ferry carries plums, not pears.\n\nClaim: the ferry carries plums.`,
  };
}
