// Tries each way a page could reach past the checking proxy, and prints one JSON line per probe:
// what the browser saw, and what the proxy decided. A socket audit samples ss(8) through the run
// and reports every connection that left loopback from a process other than the proxy's.
//   bun check-isolation.ts
import { startBrowser } from './start-browser';
import { startCheckingProxy } from './start-checking-proxy';

const proxy = await startCheckingProxy([]);
const browser = await startBrowser({ variant: 'masked', proxyPort: proxy.port });
const context = await browser.newContext();

const peers = new Set<string>();
const audit = setInterval(() => {
  void recordLeaks();
}, 200);

const navigations: readonly [string, string][] = [
  ['loopback address', 'https://127.0.0.1/'],
  ['metadata address', 'https://169.254.169.254/latest/meta-data/'],
  ['IPv6 loopback', 'https://[::1]/'],
  ['name that resolves to loopback', 'https://localtest.me/'],
  ['name that resolves to 10.0.0.1', 'https://10.0.0.1.sslip.io/'],
  ['plain http', 'http://example.com/'],
  ['port other than 443', 'https://example.com:8443/'],
  ['redirect to loopback', 'https://httpbin.org/redirect-to?url=https%3A%2F%2F127.0.0.1%2F'],
];

for (const [probe, url] of navigations) {
  // oxlint-disable-next-line no-await-in-loop -- one probe at a time, so each proxy record is its own
  await runProbe(probe, async (page) => {
    const response = await page.goto(url, { timeout: 8000 });

    return `loaded ${response?.status() ?? 'no response'} at ${page.url()}`;
  });
}

await runProbe('requests from a public page', async (page) => {
  await page.goto('https://example.com/', { timeout: 8000 });

  return JSON.stringify(await page.evaluate(sendPageRequests));
});

await runProbe('WebRTC with a public STUN server', async (page) => {
  await page.goto('https://example.com/', { timeout: 8000 });

  return `candidates: ${JSON.stringify(await page.evaluate(collectICECandidates))}`;
});

await browser.close();

// with no proxy at all, the resolver rules leave the browser no way to reach a host
const bare = await startBrowser({ variant: 'masked', proxyPort: null });
const barePage = await bare.newPage();
const bareOutcome = await barePage
  .goto('https://example.com/', { timeout: 8000 })
  .then((response) => `loaded ${response?.status()}`)
  .catch((error: unknown) => (error instanceof Error ? error.message.split('\n')[0] : 'failed'));

console.log(JSON.stringify({ probe: 'no proxy, resolver rules only', outcome: bareOutcome }));
await bare.close();

clearInterval(audit);
await recordLeaks();

const resolvConf = await Bun.file('/etc/resolv.conf').text();
const nameServers = [...resolvConf.matchAll(/^nameserver\s+(\S+)/gmu)].map((match) => match[1]);
const explained = new Set([...proxy.tunnels.flatMap((tunnel) => tunnel.address ?? []), ...nameServers]);
const unexplained = [...peers].filter((peer) => !explained.has(peer));

console.log(JSON.stringify({ probe: 'socket audit', peers: peers.size, unexplained }));
proxy.stop();
process.exit(0);

async function runProbe(probe: string, body: (page: import('playwright-core').Page) => Promise<string>): Promise<void> {
  const before = proxy.tunnels.length;
  const page = await context.newPage();
  const outcome = await body(page).catch((error: unknown) =>
    error instanceof Error ? (error.message.split('\n')[0] ?? 'failed') : 'failed',
  );

  await page.close();
  console.log(JSON.stringify({ probe, outcome, proxy: proxy.tunnels.slice(before) }));
}

// runs in the page: requests to internal addresses through fetch, an image and a WebSocket
async function sendPageRequests(): Promise<Record<string, string>> {
  const tryFetch = (url: string) =>
    fetch(url, { mode: 'no-cors' }).then(
      () => 'reached',
      (error: unknown) => `blocked: ${String(error)}`,
    );
  const tryImage = (url: string) =>
    new Promise<string>((resolve) => {
      const image = new Image();
      image.onload = () => resolve('reached');
      image.onerror = () => resolve('blocked');
      image.src = url;
    });
  const trySocket = (url: string) =>
    new Promise<string>((resolve) => {
      const socket = new WebSocket(url);
      socket.onopen = () => resolve('reached');
      socket.onerror = () => resolve('blocked');
    });

  return {
    fetchLoopback: await tryFetch('https://127.0.0.1/'),
    fetchMetadata: await tryFetch('https://169.254.169.254/latest/meta-data/'),
    fetchPrivate: await tryFetch('https://192.168.1.1/'),
    imageLoopbackHTTP: await tryImage('http://127.0.0.1:8080/x.png'),
    socketLoopback: await trySocket('ws://127.0.0.1:9222/'),
  };
}

// runs in the page: the ICE candidates the browser gathers in 3 seconds
async function collectICECandidates(): Promise<string[]> {
  const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const candidates: string[] = [];

  connection.onicecandidate = (event) => {
    if (event.candidate !== null) {
      candidates.push(event.candidate.type ?? 'unknown');
    }
  };
  connection.createDataChannel('probe');
  await connection.setLocalDescription(await connection.createOffer());
  await new Promise((resolve) => setTimeout(resolve, 3000));
  connection.close();

  return candidates;
}

// the address of every TCP or UDP peer off loopback, in any state
async function recordLeaks(): Promise<void> {
  const ss = Bun.spawn(['ss', '-tunapH'], { stdout: 'pipe' });
  const lines = (await new Response(ss.stdout).text()).split('\n');

  for (const line of lines) {
    const peer = line.trim().split(/\s+/u)[5] ?? '';
    const address = peer.slice(0, peer.lastIndexOf(':')).replace(/^\[|\]$/gu, '').replace(/^::ffff:/u, '');

    if (address !== '' && address !== '*' && !/^(127\.|::1$|0\.0\.0\.0)/u.test(address)) {
      peers.add(address);
    }
  }
}
