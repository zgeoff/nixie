# Spikes

Each directory here is one throwaway experiment that answers a research question for a track under
[docs/research](../docs/research/). A spike is its own Bun package with exact dependency versions.
Its README gives the question, the versions it ran against, how to run it, the output it produced,
and what it left untested.

Spikes that call Claude read a token from the repo's `.env`, which git ignores; `.env.example` lists
the variable.
