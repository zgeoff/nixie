# Web fetch

- Decisions: [0005](../../../decisions/0005-effects-and-taint.md),
  [0030](../../../decisions/0030-connectors-and-sandbox-environments.md)

Web fetch is one of nixie's own tools: it fetches one public HTTPS page for the model and returns
its text. It declares only the `fetch` effect, so it runs `direct`. It declares no destination, as
the [destination limits](../policy/decision-point.md#destination-limits) set for the first build.

The tool runs in the fetch sandbox, a [sandbox](sandbox-adapter.md#sandboxes-by-kind-of-work) with
`public` egress and no grants. `public` egress reaches the global internet only, and the sandbox
adapter enforces it at the network layer, as the [sandbox adapter](sandbox-adapter.md#public-egress)
defines. **Why:** hostile content is parsed outside nixie's trusted process, and the network layer
enforces the address boundary, so a bug in the fetcher's own checks cannot reach an internal
address.

nixie starts the fetcher in the fetch sandbox with `spawn`, and talks to it over that process's
stdin and stdout, never over the sandbox's network. Each fetch is one JSON line in, with the URL,
and one JSON line out, with the result. The fetcher resolves the host, fetches the page and extracts
its text inside the sandbox.

The fetcher uses a plain HTTP client, never the host's [credential fetcher](credentials.md), so a
request carries no credential, cookie or stored header. It drops any user name or password in the
URL. It also runs the address check below as a second layer, in these stages:

1. It accepts `https` only, and refuses every other scheme, `http` included.
2. It resolves the host, checks every A and AAAA address returned, and refuses the URL when any
   address is not public.
3. It connects to the address it checked, and sends the host name for TLS and in the `Host` header,
   so a second DNS answer never changes where the request goes.
4. It runs the first 3 stages again on every redirect.

## Non-public addresses

The address check refuses these addresses:

- loopback, the private ranges, and the unspecified, multicast and broadcast addresses
- link-local, which holds cloud metadata services at `169.254.169.254`
- the shared address space `100.64.0.0/10`, which holds Tailscale addresses
- IPv6 unique local and link-local addresses
- an IPv6 address that embeds an IPv4 address, such as the IPv4-mapped, NAT64, 6to4 and Teredo
  forms, when the embedded address is non-public
- any range the deployment lists as internal, such as a cluster's pod and service ranges, whatever
  their public or private class

## Limits and the result

Each fetch has 4 limits, all configurable: a body of 2 MB read, 15 s for the whole call with its
redirects, 5 redirects, and 256 KB of returned text. The fetcher stops at the body limit or the text
limit and marks the result as truncated.

The result holds the final URL, the status code, the content type, the page's text and the truncated
mark. An HTML page returns its readable text, another text type returns as it arrived, and a binary
type returns no body. Every field is outside content. The status code and the truncated mark are
endorsed types, and the URL and the text never are.

## The sandbox's lifetime

The first build keeps one long-lived fetch sandbox, and replaces it after a configurable number of
fetches or on any error. It holds no grants and no data that nixie gives it beyond each URL. Each
fetch runs in a new fetcher process with a new temporary directory. The fetches in one sandbox still
share a boundary: a page that compromises the fetcher can see the URLs of later fetches in the same
sandbox until the sandbox is replaced, and can send them out over its public egress. **Why it is
acceptable for the first build:** the URLs carry no credential, every result is outside content, and
an outbound check on URLs that carry private context is a
[later stage](https://linear.app/zgeoff/issue/GEO-309). One sandbox per fetch removes the shared
boundary, and becomes the default once the worker cold start spike measures its cost.
