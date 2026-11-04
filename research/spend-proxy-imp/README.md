# Spike: the counting proxy behind imp's broker

This spike sends a nixie preview's model calls from an imp, through imp's broker, to a counting
proxy on the host, and probes the guest for a way to the model API around it. It informs the
[hard spending stop](../../docs/design/platform/policy/budgets.md#the-hard-spending-stop), which
relies on the broker to send every model request through the proxy.

## Question

Do a worker's model requests pass from imp's broker through the counting proxy on the host and get
counted, so that budgets can count spend at the host? Does the broker give the guest any second
route to the model API, which would let a worker get past the hard spending stop?

## Answer

The recorded run is under way.

## Results

The [results](results.md) hold the setup, the counts and the probes.

## Untested

The [untested list](results.md#untested) holds what the run left out.
