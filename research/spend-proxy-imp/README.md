# Spike: the counting proxy behind imp's broker

This spike sends a nixie preview's model calls from its imp, through imp's broker, to a counting
proxy on the host, and probes the guest for a way to the model API around it. It informs the
[hard spending stop](../../docs/design/platform/policy/budgets.md#the-hard-spending-stop), which
relies on the broker to send every model request through the proxy.

## Question

Do a worker's model requests pass from imp's broker through the counting proxy on the host and get
counted, so that budgets can count spend at the host? Does the broker give the guest any second
route to the model API, which would let a worker get past the hard spending stop?

## Answer

- Every model call from the preview took the imp's counted grant and reached the model API through
  the imp's own counting proxy [measured].
- The model API refused every call with a 429, because the preview's credential was at its rate
  limit, so the count stayed at 0 and the spike never saw a reply counted [measured].
- The broker refused all 6 paths outside the imp's route, dot segments and encoded slashes included,
  and the proxy refused the batch endpoint [measured].
- Requests that went around the broker reached the model API with no credential, and got a 401
  [measured].

The broker opens no second route, so the hard stop can sit on the host; the count needs a run with a
credential under its rate limit.

## Run it

```bash
cd research/spend-proxy-imp
bun run spike
```

The [setup](results.md#setup) lists the environment the run needs and each of its steps.

## Results

The [results](results.md) hold the route, the counted calls, the probes and the follow-ups.

## Untested

A reply with usage on the counted route, a started task's own calls, and a worker in an imp of its
own. The [untested list](results.md#untested) gives the rest.
