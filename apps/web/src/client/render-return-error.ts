// The page the return route shows when a consent did not finish. It names the nixie error code and
// Google's own code, and never the state or the code that the URL carried.
export function renderReturnError(
  status: number,
  code: string,
  providerError: string | null,
): Response {
  const detail =
    providerError === null ? '' : `<p>Google said: <code>${escapeText(providerError)}</code></p>`;

  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>The connection did not finish</title>
</head>
<body>
<h1>The connection did not finish</h1>
<p>Error: <code>${escapeText(code)}</code></p>
${detail}
<p><a href="/settings/connections">Back to connections</a></p>
</body>
</html>
`;

  return new Response(page, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; style-src 'none'; frame-ancestors 'none'",
      'x-frame-options': 'DENY',
    },
  });
}

const escapes: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeText(text: string): string {
  return text.replaceAll(/[&<>"']/gu, (character) => escapes[character] ?? character);
}
