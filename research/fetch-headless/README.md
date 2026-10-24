# Spike: a headless browser in the fetch sandbox

This spike reads challenge-protected pages with headless Chromium held to the fetch sandbox's
limits, behind a proxy that runs the fetcher's own address checks on every connection. It measures
the pass rate, the cost against the sandbox's limits, and whether the browser keeps the sandbox's
egress isolation.

## Question

Does headless Chromium in the fetch sandbox pass common bot challenges, and how often? What does it
cost in image size, memory, start time and egress? Does it keep the fetcher's address checks and
redirect pinning, and should it run on every fetch or only after a plain fetch is challenged?

## Answer

- A browser with a desktop Chrome user agent passed 25 of 42 reads, and reached 8 of 12 protected
  URLs: 7 of 8 on Cloudflare and the one on PerimeterX. It never passed DataDome.
- A browser whose user agent holds `HeadlessChrome` passed 1 of 12, as often challenged as a plain
  fetch.
- Chromium's headless-only build passed in a median of about 4.0 s and under 350 MiB, inside the
  sandbox's 1 vCPU and 512 MiB. Its image is 1.06 GB on disk.
- Every connection of the headless-only build went through the proxy. The full browser sent one DNS
  query past it.

Run the headless-only build, and only after a plain fetch is challenged.

## Run it

```bash
docker build -f research/fetch-headless/Dockerfile -t fetch-headless:full .
docker build -f research/fetch-headless/Dockerfile -t fetch-headless:shell \
  --build-arg ENGINE=chromium-headless-shell .
cd research/fetch-headless
bun install
bun run-bench.ts results.jsonl full:plain,full:masked,shell:masked https://www.npmjs.com/package/react
docker run --rm --cpus=1 --memory=512m --memory-swap=512m fetch-headless:shell check-isolation.ts
```

The [setup](results.md#setup) gives the versions, the proxy and the two browser variants.

## Results

The [results](results.md) hold the pass rate per URL, the cost and isolation tables, and the
answers, and [results/](results/) holds every result line.

## Untested

An imp sandbox itself, a residential egress address, and vendors beyond the 3 tested. The
[untested list](results.md#untested) gives the rest.
