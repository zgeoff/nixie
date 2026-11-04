# Spike: the counting proxy behind imp's broker

This spike checks whether every model call from an [imp](../../docs/glossary.md) reaches the model
API through the host's [counting proxy](../../docs/architecture/policy/counting-proxy.md), which
adds each reply's tokens and dollars to a count. It informs the
[hard spending stop](../../docs/design/platform/policy/budgets.md#the-hard-spending-stop). Code in
an imp holds no model credential: imp's broker, the imp's HTTPS proxy on the host, adds the
credential to each request that the imp's grant covers. The spike ran on a nixie pull request's
preview, a throwaway nixie in an imp of its own, on a host that gives each preview its own counting
proxy.

## Question

Does the broker send each model call from an imp through the counting proxy, and does the proxy
count it, so that the hard stop can count spend on the host? Can code in the imp get a request to
the model API with the credential on it by any way that skips the proxy?

## Answer

Each line ends with [measured]: the spike made the request or the read that shows it.

- The broker added the credential to every model call from the preview, and sent each one through
  the preview's counting proxy to the model API [measured].
- The broker adds the credential only under the URL path `/<imp>/`, which leads to the proxy. It
  refused the 6 other paths that the spike tried, dot segments and encoded slashes included
  [measured].
- A direct path from the imp exists, and it carries no credential. With its HTTPS proxy turned off,
  code in the imp reached the model API and the host's model route listener, which sits in front of
  the proxy. The broker never saw either request, and the model API answered both with 401
  [measured].
- The model API answered every model call with a 429, because the credential was at its account's
  rate limit during the spike. The count stayed at 0 tokens and $0 [measured].

No request that carries the credential skips the proxy, so the hard stop can sit on the host. The
spike never saw the proxy count a reply with usage, which the
[issue](https://linear.app/zgeoff/issue/GEO-248) keeps open.

## Run it

1. Set the variables that the [setup](results.md#setup) lists: the preview host's SSH target, the
   preview's imp and origin, and a scratch directory.
2. Run the spike from a machine with SSH access to the preview host as root:

   ```bash
   cd research/spend-proxy-imp
   bun run spike
   ```

   Expect exit 0, and the output of each of the script's 5 steps in the scratch directory.

## Results

[results.md](results.md) gives the setup, the model calls and the probes.

## Untested

The spike did not test a reply with usage, or a worker in an imp that the sandbox adapter creates.
The [untested list](results.md#untested) gives the rest.
