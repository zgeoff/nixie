# Search

The search tool searches the web for the model and returns the hits with what the search cost. It
runs on the host, inside nixie, because it calls one fixed API host, reads JSON back and needs an
API key that must never enter a sandbox. The tool holds no page parser, so a hit's page stays
outside nixie until the model follows the hit's URL with the [web fetch](./web-fetch.md) tool, which
fetches it in the fetch sandbox. [Tool calls](./tool-calls.md) covers the endpoint that runs the
tool, and [0014](../../decisions/0014-search.md) covers why search returns full results.

## The tool

A call sets a query, and can set:

- `limit`, the most hits to return, 10 when left out and up to 25;
- `sites`, the domains every hit must come from;
- `freshness`, `day`, `week` or `month`, which keeps only pages published or updated within that
  span.

The tool declares only the fetch effect and no destination, so the decision point's read-only rule
allows it and it runs direct, inside the turn. Its result holds the hits, each with a title, a URL,
a snippet and a publication date when the search index gives one, and `costUSD`, what the search
cost. Every field of the result is outside content, because a title and a snippet are text from the
page, and a URL can carry text in its path. The result schema marks only the date as an endorsed
type, because a date and time carries no words. A page or the index sets that date, so it can be
wrong: it is endorsed as a type, not clean. A failed search returns an error with the provider's
reason, which the model reads.

The call's record keeps the whole result, cost included, so the conversation's event log shows what
each search cost. Moving search onto a paid-tool budget is planned in
[GEO-1813](https://linear.app/zgeoff/issue/GEO-1813).

## The daily call cap

The tool counts its calls per day and refuses a call once the day's count reaches the cap, 200 by
default. The `daily_call_cap` value in the deployment config's `search` section sets the cap. A day
starts at midnight in the default zone of the [time](./time.md) tool, so the count resets at the
same hour each day. A refused call returns an error that holds the cap and the date the count resets
on, and the tool sends the provider nothing.

The tool counts a call before it asks the provider, in one statement that adds the call only while
the day's count is under the cap. Two calls at once therefore never both take the last call under
the cap. A call that the provider then fails still counts, because the request reached the provider.
The count keeps one row per day in the `search_calls` table, which holds no query or result, so a
forget leaves it.

## Providers

A provider takes the query, the limit, the sites and the freshness, and returns the hits with the
search's cost, or a reason for the failure. The tool depends on no one provider, so another provider
fits behind the same tool.

Kagi is the one provider. Its adapter calls the search endpoint of Kagi's v1 API, sends the sites as
the lens's `sites_included` and the freshness as its `time_relative`, and takes each hit's date from
Kagi's `time`. The adapter keeps that date only when it parses as an ISO 8601 date and time with an
offset, so the one endorsed field never carries other text. Kagi's price list charges $12 for 1000
searches, so each search costs $0.012.

## The key

The search key is a static credential from the deployment. The `credential` value in the deployment
config's `search` section holds a reference of the form `deployment:<name>`, and the secrets file
holds the key under `connector_credentials` with that name. The server resolves the reference once
the secrets load, and refuses to start when the secrets file lacks the entry. A deployment whose
config sets no credential gets no search tool.

The key stays in the server's memory. The adapter sends it only in the `Authorization` header of its
requests to the API URL in the `search` section, and a provider's failure reason never holds it, so
the key reaches no record, log event or sandbox. The server reads the secrets file once at start, so
a new key takes effect at the next deploy.
