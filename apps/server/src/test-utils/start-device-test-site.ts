import { buildIntegrity, buildPackageTarball } from '@heynixie/testing';

export interface DeviceTestSite {
  // the loopback address of the site, which the fetch sandbox's stand-in reads
  readonly url: string;

  readonly stop: () => Promise<void>;
}

// The web that a device page reaches in a journey: the tide page it declares as a fetch, and a
// registry with one package, ripple-count 1.0.0, as its document and its tarball. The tide page
// answers with the high tide that its `?high=` query names, so a refresh can show another value.
export function startDeviceTestSite(): DeviceTestSite {
  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  return { url: `http://127.0.0.1:${String(site.port)}/`, stop: () => site.stop(true) };
}

const tarball = buildPackageTarball([
  { path: 'package/package.json', content: '{"name":"ripple-count","version":"1.0.0"}' },
  { path: 'package/ripples.js', content: 'window.rippleCount = 7;' },
]);

function answerRequest(request: Request): Response {
  const url = new URL(request.url);

  if (url.pathname === '/today') {
    return Response.json({ high: url.searchParams.get('high') ?? '14:05' });
  }

  if (url.pathname === '/ripple-count/1.0.0') {
    return Response.json({
      name: 'ripple-count',
      version: '1.0.0',
      description: 'Counts ripples on a pond.',
      _npmUser: { name: 'a-publisher' },
      dist: { integrity: buildIntegrity(tarball), unpackedSize: 70 },
    });
  }

  if (url.pathname === '/ripple-count/-/ripple-count-1.0.0.tgz') {
    return new Response(tarball);
  }

  return new Response('not found', { status: 404 });
}
