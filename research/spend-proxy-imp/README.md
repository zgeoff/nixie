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
- A direct path from the imp to the model API exists, and it carries no credential. With its HTTPS
  proxy turned off, code in the imp reached the model API, which answered with 401. The broker never
  saw the request [measured].
- The host refuses a connection from the imp to its model route listener, which sits in front of the
  proxy [measured].
- The proxy counted every reply. With a credential that the model API answered with 200, the count
  reached 64405 tokens and $0.00345904. The tokens equal the sum of nixie's own turn records plus a
  memory writer call, and the dollars equal those turns' tokens at the preview's prices [measured].

No request that carries the credential skips the proxy, and the proxy counts each reply, so the hard
stop can count spend on the host.

## Run it

1. Set the 8 variables that [run it](results.md#run-it) lists, such as the preview host's SSH
   target, the preview's imp and origin, and a scratch directory.
2. Run one spike at a time on a preview. The proxy keeps one count for the preview's imp, so a
   second spike's model calls land in the same count.
3. Run the spike from a machine with SSH access to the preview host as root:

   ```bash
   cd research/spend-proxy-imp
   bun run spike
   ```

   Expect exit 0, and the output of each of the script's 5 steps in the scratch directory.

## Results

[results.md](results.md) gives the setup, the model calls and the probes.

## Untested

The spike did not test a worker in an imp that the sandbox adapter creates. The
[untested list](results.md#untested) gives the rest.
