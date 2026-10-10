# Spikes

Each directory here is one throwaway experiment that answers a research question for a track under
[docs/research](../docs/research/). A spike is its own Bun package with exact dependency versions.
Its README gives the question, the versions it ran against, how to run it, the output it produced,
and what it left untested.

Spikes that call the model read a token from the repo's `.env`, which git ignores; `.env.example`
lists the variable.

[Tools through a reverse forward](./tools-reverse-forward/) measures relay overhead and checks the
SDK tool round trip, streamed responses, egress isolation and sleep/wake recovery with a local model
stand-in and one dummy credential grant.

[Session forwarding through Start](./start-session-forwarding/) runs the web client on TanStack
Start as its own server. It checks that server rendering forwards the device session to the API,
that Start holds no session, and that the browser bundle holds no server code.
