import type { FeatureID } from '@heynixie/contract';

// The page the return route shows when the feature that the return belongs to is off in this nixie.
// It reads no state and no code, and the URL's query string stays out of it.
export function renderReturnFeatureOff(feature: FeatureID): Response {
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>This feature is off in this nixie</title>
</head>
<body>
<h1>This feature is off in this nixie</h1>
<p>The ${feature} feature is not set up here, or you are not signed in, so there is nothing to finish.</p>
<p><a href="/">Back to nixie</a></p>
</body>
</html>
`;

  return new Response(page, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; style-src 'none'; frame-ancestors 'none'",
      'x-frame-options': 'DENY',
    },
  });
}
