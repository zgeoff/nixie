# Spike results: a headless browser in the fetch sandbox

This spike reads challenge-protected pages with headless Chromium held to the fetch sandbox's
limits, behind a proxy that runs the fetcher's own address checks on every connection. A browser
that presents a desktop Chrome user agent passed 25 of 42 reads, and reached the page on 8 of 12
protected URLs: 7 of 8 Cloudflare URLs and the one PerimeterX URL. It never passed DataDome, and
never cleared a Cloudflare challenge that stayed up. In the second round, 6 of 8 Cloudflare sites
served the browser no challenge at all, because the challenge answered the plain client, not the
page. Chromium's headless-only build cost a median of about 4 s and under 350 MiB per protected
page, so the browser fits the sandbox as a fallback that runs only after a plain fetch is
challenged.

## Questions

1. Does headless Chromium in the fetch sandbox pass common bot challenges, and how often?
2. What does it cost in image size, memory, start time and egress, against the sandbox's limits?
3. Does it keep the sandbox's egress isolation, the fetcher's address checks and its redirect
   pinning?
4. Should it run on every fetch, or only after a plain fetch is challenged?

## Setup

| Component                                       | Version       |
| ----------------------------------------------- | ------------- |
| Debian `chromium` and `chromium-headless-shell` | 155.0.8059.39 |
| `playwright-core`                               | 1.64.1        |
| Bun, and the `oven/bun` slim base image         | 1.4.2         |
| Debian                                          | 13.6          |

[`Dockerfile`](Dockerfile) builds the spike image on the fetch image's base, with one of two
engines: the full Chromium browser, or the headless-only build that Debian packages as
`chromium-headless-shell`. A managed policy file, [`chromium-policy.json`](chromium-policy.json),
turns off the browser's component updates, sign-in, sync and network time queries.

[`start-checking-proxy.ts`](start-checking-proxy.ts) is a CONNECT proxy on loopback, and the only
route out for the browser. For each tunnel it runs the hop planner from `guests/fetch`: https only,
every A and AAAA address of the host checked, and the socket opened to the checked address. It
refuses every port other than 443 and every plain-HTTP proxy request. The browser never resolves a
host, so a second DNS answer cannot move a connection, and TLS still checks the certificate against
the host name inside the tunnel.

[`start-browser.ts`](start-browser.ts) starts Chromium behind that proxy with QUIC off, WebRTC
limited to proxied UDP (so to none), and resolver rules that answer every name except loopback with
NOTFOUND. A request that skipped the proxy therefore could not resolve its host. It starts the
browser in one of two variants:

- **plain**: headless Chromium as Playwright starts it, whose user agent holds `HeadlessChrome`.
- **masked**: a desktop Chrome user agent for the same build, without the automation flag and with
  Blink's `AutomationControlled` feature off.

[`read-in-browser.ts`](read-in-browser.ts) reads one page in a new browser, polls it until it holds
no challenge and a 2xx document with text, and prints timings, statuses, sizes, the container's peak
memory and the proxy's tunnels. [`read-plain.ts`](read-plain.ts) reads a page with the fetcher's own
page reader, for comparison. [`run-bench.ts`](run-bench.ts) runs each read in a new container with 1
vCPU, 512 MiB and no swap, the fetch sandbox's default limits. A read that passes its deadline
prints a failed result and stops its browser, and the bench kills a container that outlives the
read, so a page whose script never ends cannot hold up the reads after it.
[`check-isolation.ts`](check-isolation.ts) runs the egress probes.

The runs used Docker on one imp, with a datacenter egress address. Each protected URL was read at
most 5 times in the browser.

Run both builds from the repo root, because the proxy imports the hop planner from `guests/fetch`.
The [`results`](results/) folder holds every result line from the runs below, with page titles and
host names removed.

## Results

### Pass rate

The protected URLs came from a probe with a plain HTTP client, which got a 403 with
`cf-mitigated: challenge` from each Cloudflare URL and a block page from each other vendor. Round 1
read each URL in the plain full browser, the masked full browser and the masked headless shell.
Round 2 read each URL outside DataDome once more in each masked engine. A read passed when its last
document was a 2xx with more than 200 characters of text and no challenge markup, within 30 s.

| URL                                            | Vendor     | Plain variant | Masked passes | Masked browser challenged |
| ---------------------------------------------- | ---------- | ------------- | ------------- | ------------------------- |
| `https://openai.com/index/introducing-dots/`   | Cloudflare | challenged    | 2 of 4        | round 1, never cleared    |
| `https://www.indeed.com/`                      | Cloudflare | challenged    | 2 of 4        | round 1, never cleared    |
| `https://www.glassdoor.com/index.htm`          | Cloudflare | challenged    | 0 of 4        | every read, never cleared |
| `https://stackoverflow.com/questions/11227809` | Cloudflare | passed        | 4 of 4        | every read, cleared       |
| `https://www.udemy.com/`                       | Cloudflare | challenged    | 2 of 4        | round 1, never cleared    |
| `https://www.coinbase.com/`                    | Cloudflare | challenged    | 4 of 4        | never                     |
| `https://www.npmjs.com/package/react`          | Cloudflare | challenged    | 4 of 4        | never                     |
| `https://www.quora.com/`                       | Cloudflare | challenged    | 4 of 4        | never                     |
| `https://www.zillow.com/`                      | PerimeterX | blocked       | 3 of 4        | 1 read, never cleared     |
| `https://www.g2.com/products/slack/reviews`    | DataDome   | challenged    | 0 of 2        | every read                |
| `https://www.etsy.com/`                        | DataDome   | blocked       | 0 of 2        | every read                |
| `https://www.wsj.com/`                         | DataDome   | blocked       | 0 of 2        | every read                |

A cell reads "challenged" when the browser found Cloudflare challenge markup in the page, and
"blocked" when it found a DataDome or PerimeterX block page. The masked variant passed 25 of 42
reads: 9 of 24 in round 1 and 16 of 18 in round 2. Outside DataDome it passed 25 of 36 reads, and on
Cloudflare 22 of 32. The headless shell passed 13 of 21 masked reads and the full browser 12 of 21.
The plain variant passed 1 of 12, because Cloudflare challenged its `HeadlessChrome` user agent on
all 8 Cloudflare sites and on G2, and it cleared only Stack Overflow's challenge. DataDome and
PerimeterX blocked it on the other sites.

On 3 of 8 Cloudflare sites the masked browser never met a challenge. On OpenAI, Indeed and Udemy,
both round 1 reads kept Cloudflare's challenge markup for the full 30 s, and both round 2 reads got
the page with no challenge, so the challenge that a plain client meets came and went between rounds.
The spike did not isolate which signal let the browser through; its TLS fingerprint and its script
support are the likely candidates. Stack Overflow challenged every browser read and the browser
cleared it every time, passing in 6.7–10.5 s in round 2. Glassdoor's challenge page stayed up for
the full 30 s in every read, and the spike did not find which check it runs. The one other masked
failure outside DataDome was a round 1 Zillow read in the full browser that PerimeterX denied. The
plain probe found a DataDome block page on G2, but the browser met Cloudflare challenge markup there
in every read.

### Cost

Each figure comes from the masked reads in round 2 and in the baseline, inside the 1 vCPU and 512
MiB limit. Pass time runs from the process start to the passing page. Anonymous memory leaves out
the page cache, which the kernel reclaims under the limit.

| Measure                               | Plain fetch  | Headless shell   | Full browser     |
| ------------------------------------- | ------------ | ---------------- | ---------------- |
| Image on disk                         | 251 MB       | 1.06 GB          | 1.29 GB          |
| Image download, compressed            | 71.5 MB      | 300 MB           | 355 MB           |
| Browser start                         | none         | 119–1400 ms      | 410–1568 ms      |
| Pass time on protected pages, median  | not passed   | about 4.0 s      | about 8.0 s      |
| Pass time on protected pages, slowest | not passed   | 6.7 s            | 12.2 s           |
| Unprotected pages, 3 pages            | 0.13–2.1 s   | 0.67–2.5 s       | 2.0–6.5 s        |
| Peak anonymous memory, every read     | under 20 MiB | 138–341 MiB      | 218–437 MiB      |
| Egress per page, median and largest   | one body     | 1.9 MiB, 5.2 MiB | 1.7 MiB, 5.2 MiB |

The headless shell fits the sandbox's limits with room to spare. The full browser reached the 512
MiB limit with its page cache in round 1, and its anonymous memory came within 75 MiB of it. Both
images fit the 4096 MiB disk that impd gives a built image. Every browser pass finished inside the
fetch's 15 s time limit, but the slowest full-browser pass left under 3 s of it.

A page in the browser downloads its scripts, styles and images too. Egress therefore ran past the
fetcher's 2 MiB body limit on the largest page, and the proxy is the one place a browser read can
count it.

The full browser opened tunnels to Google's update, sign-in and messaging hosts on every read, with
the policy file and every background flag set. The headless shell opened no tunnel to the update or
messaging hosts in any read, and the full browser's direct DNS query appears under
[egress isolation](#egress-isolation).

### Egress isolation

Every probe in the browser ended at the proxy, in both engines:

| Probe                                         | Outcome                                     |
| --------------------------------------------- | ------------------------------------------- |
| `https://127.0.0.1/`, `https://[::1]/`        | refused: not a public address               |
| `https://169.254.169.254/`                    | refused: not a public address               |
| a name that resolves to loopback or 10.0.0.1  | refused: not a public address               |
| `https://example.com:8443/`                   | refused: the port is not 443                |
| a public redirect to `https://127.0.0.1/`     | the first hop connected, the second refused |
| fetch, image and WebSocket from a public page | each refused by the proxy                   |
| WebRTC with a public STUN server              | no candidates gathered                      |
| the browser started with no proxy             | `net::ERR_NAME_NOT_RESOLVED`                |

A socket audit sampled every TCP and UDP socket off loopback through the probe run, with the process
that owned it, every 200 ms. A packet capture of everything outside loopback and TCP port 443 ran
beside it, in a separate run of each engine. In the headless shell, every socket belonged to the
proxy, and the only packets were the proxy's own DNS lookups. The full browser sent one DNS query
for `google.com` straight to a public resolver over UDP, outside the proxy and the resolver rules.
That query carries no page data, but it is traffic the proxy never checks. Both captures also held
link-local IGMP membership reports, which the spike did not trace to a process.

Two results differ from the fetcher. A plain `http://` URL reached the proxy as a plain request in
the headless shell, which the proxy refused with a 403 that the browser showed as the page. The full
browser upgraded the same URL to https by itself and loaded it. A browser reader therefore checks
the scheme of the first URL itself, and reads a refused main document from the proxy's record, not
as a page with status 403.

## Answers

### 1. Challenges

A masked headless browser reaches most Cloudflare-protected pages, here 7 of 8 sites and 22 of 32
reads, and the PerimeterX page in 3 of 4 reads. In the second round Cloudflare challenged it on only
2 of 8 sites, but in the first round the challenge on 3 more sites stayed up for the whole read, so
a pass on one read does not promise a pass on the next. It fails DataDome every time, and fails
Cloudflare's interactive challenge. A headless browser whose user agent holds `HeadlessChrome` gets
challenged as often as a plain fetch, so the gain depends on presenting a desktop Chrome user agent.
The fetcher's user agent holds `nixie-fetch`, and a masked user agent gives that up. That trade is a
product choice that this spike leaves open.

### 2. Cost

The headless-only build is the engine to use. It is smaller, starts faster, passes in about half the
time and with about two thirds of the memory, and opens no background connections. The full
browser's background DNS query bypasses the proxy, which rules it out on isolation alone. One
browser per fetch fits the 1 vCPU and 512 MiB sandbox. The image grows about 4 times, to about 1 GB
on disk.

### 3. Isolation

The browser keeps the fetcher's checks when every connection runs through an in-sandbox proxy that
reuses the fetcher's hop planner. Each tunnel, every subresource and redirect included, passes the
same address check and connects to the checked address. The network layer's public egress stays the
first boundary. The proxy is the second, and the resolver rules make the browser unable to reach a
host without the proxy. Both hold for the headless shell only: the full browser sent a DNS query
past them. A sampled socket audit can miss a socket that lives under 200 ms, so the packet capture
is the stronger evidence.

### 4. When it runs

The browser runs only after a plain fetch is challenged. On 3 unprotected pages the headless shell
added 0.4–1.3 s and used about 8 times the plain fetch's memory, for a page the plain fetch reads in
full. The fetcher's challenge finding marks the case where the browser helps.

The pass counts in the [results](#pass-rate) hold this recommendation up. A plain fetch reads none
of the 12 protected URLs, and the masked browser reaches 8 of them, in 25 of 42 reads. A read that
the browser fails costs one browser start after the challenged plain fetch, which the sandbox's
limits allow. The headless shell passed as many reads as the full browser, 13 and 12 of 21, so the
engine choice in the [cost answer](#2-cost) stands on its cost and isolation alone.

## Untested

- An imp sandbox itself. The runs held Docker containers to the sandbox's limits on an imp, and
  Chromium's own sandbox stayed off, because it failed to start under Docker's default profile.
- A residential egress address, and pass rates over days. Bot scores depend on the egress address
  and change over time, so these rates hold for one datacenter address on one day.
- Akamai, Kasada, hCaptcha and other vendors.
- The fetcher's readable-text extraction on the browser's DOM, and a page that the proxy cuts at an
  egress cap.
- A CDP client without Playwright.
