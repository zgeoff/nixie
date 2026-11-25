# Search

The search tool searches the web for the model and returns the hits. The tool runs in the nixie
server process, outside every sandbox. A sandbox holds code that reads untrusted pages, and the
search tool reads none: it sends one request to one fixed API address and parses the JSON answer.
Its API key stays on the server, because a key inside a sandbox could leak through the code that
runs there. The model fetches a hit's page by the hit's link ID with the [web fetch](./web-fetch.md)
tool, which reads the page in the fetch sandbox. [Tool calls](./tool-calls.md) covers the endpoint
that runs the tool.

## The tool

A call sets a query, and can set:

- `limit`, the most hits to return, 10 when left out and up to 25;
- `sites`, the domains every hit must come from;
- `freshness`, `day`, `week` or `month`, which keeps only pages published or updated within that
  span.

The tool declares only the fetch effect, so the [decision point](../policy/decision-point.md) allows
a search when an allow rule covers that effect, such as the starter rule `allow-reads`, and asks
otherwise. The tool runs [direct](./tool-calls.md#a-tool-definition), inside the model's turn, like
every tool that changes nothing outside nixie. A failed search returns an error that holds the
provider's reason, and the model reads it.

## What the result carries

The result holds the hits. Each hit holds a link ID, a title, a URL, a snippet, and a date when the
search index gives one. The title and the snippet are plain text, with no HTML tags or entities. The
date is the day the page was created or last updated, with no time of day.

Each hit's link ID, such as `L12`, comes from the count that numbers the links of fetched pages, so
the model passes it to web fetch to read the page. The tool numbers the hits in the transaction that
checks for a forget, as [link IDs](./web-fetch.md#link-ids) describes, and refuses the search when a
forget ended the session.

The tool declares the source of content of each result field, which the call's
[result record](./tool-calls.md#records) stores. It declares the hits as `untrusted`, meaning
outside content: a title and a snippet are text from the page, and a URL can carry text in its path.
Each hit still carries its title and snippet, because a model that sees only URLs ranks hits it
cannot read.

The output schema also marks the date as an endorsed type. An endorsed type is a type that can carry
none of the page's words, such as a number, or a string held to one fixed format. A free-form string
never is one. The schema holds the date to the ISO 8601 date format, and the tool keeps a hit's date
only when it parses as a date, whatever the provider sent, so the date never carries other text. The
date keeps outside content as its source, because a page or the index sets it, so it can be wrong.
Endorsement changes no decision yet. The [web fetch](./web-fetch.md#the-tool) tool marks its status
code the same way.

The result leaves out what the search cost, because a price in front of the model can steer what it
searches for. Every paid search records its cost under `hidden` in the
[result record](./tool-calls.md#records), which the model never reads, so the event log shows what
the search cost. That includes a search the tool refuses because a forget ended the session while
the provider answered. Result records from earlier releases hold `costUSD` inside the result, and
`log.read` ([reading the log](../memory/context.md#reading-the-log)) drops it. Code that totals
search spend from the log reads both places.

## The budgets

Search is a [paid tool](../policy/budgets.md#paid-tools). Set the price of one search, in micros,
with `search.price_micros` in the server config. The default is 12,000 ($0.012), the price on Kagi's
[price list](https://kagi.com/api/pricing). The tool's hidden `costUSD` comes from the same number.
Each search charges that price to the built-in budgets `search-day` ($5) and `search-month` ($50)
before the provider sees it. At a limit, the model reads
`budget reached: search-day. Resets at midnight.` and the provider gets nothing.

A search that fails at the provider credits both charges, because the provider did not bill. A
search that the tool refuses because a forget ended the session keeps both charges, because the
provider answered.

## The daily call cap

The tool refuses a search once the day's count of searches reaches the cap. A day starts at midnight
in the time zone that the [time](./time.md) tool's `default_zone` setting holds, so the count resets
at the same hour each day. A refused search returns an error that holds the cap and the date the
count resets on, and the tool sends the provider nothing.

The cap is the paid call cap of the tool, so one write transaction checks the cap, charges both
[budgets](#the-budgets) and counts the search, before the tool sends the request. The cap refuses
first: when the cap and a budget are both full, the model reads the cap's error, and the count stays
as it was. A refused budget leaves the count unchanged too. The tool never takes a search back off
the count, so a search that fails, at the provider or on the way to it, still counts, although its
charges are credited. The count keeps one row per day in the `search_calls` table. The row holds no
query and no result, so a [forget](../memory/context.md#forgetting-and-the-live-session) leaves it
in place.

## Providers

The connectors module holds the tool and the provider interface. A provider takes the query, the
limit, the sites and the freshness, and returns the hits, or a reason for the failure. The tool
calls nothing else of the provider, so another provider can replace Kagi without a change to the
tool. The provider holds its own key, and its failure reason must never hold that key, because the
tool passes the reason to the model as it is.

Kagi is the one provider, in the `search-kagi` adapter. The adapter sends the sites and the
freshness in Kagi's lens, the set of filters Kagi applies to one search. The adapter sets no price:
[the search budgets](#the-budgets) charge the configured price. The fetcher that adds the key, as
[settings and the key](#settings-and-the-key) says, removes it from every failure, so an error in
which Kagi repeats the key still reaches the model without it.

Kagi marks the query's words in a title or a snippet with tags such as `<strong>`, and escapes
characters as entities such as `&#39;`, so the adapter strips the tags and decodes the entities. The
adapter takes each hit's date from the day of the `time` Kagi gives the hit, which Kagi's
[Search API docs](https://kagi.com/api/docs/openapi/search) call the date when the resource was
created or last updated. Kagi can set the time of day to the moment of the search, so the time of
day tells the reader nothing about the page, and the adapter drops it.

## Settings and the key

The deployment config's `search` section holds the tool's settings:

| Setting          | Default                   | What it sets                                            |
| ---------------- | ------------------------- | ------------------------------------------------------- |
| `daily_call_cap` | 200                       | the most searches in one day                            |
| `credential`     | none                      | the key, as a reference of the form `deployment:<name>` |
| `price_micros`   | 12,000                    | what one search costs, in millionths of a dollar        |
| `api_url`        | `https://kagi.com/api/v1` | the base URL of Kagi's API                              |

Put the key in the [secrets file](../deployment/server.md#configuration-and-secrets) under
`connector_credentials`, with the name the reference uses. After the secrets load at start, the
server resolves the reference, and refuses to start when the secrets file lacks the entry. A
deployment whose config sets no credential gets no search tool.

The key stays in the server's memory. The adapter holds no key: it calls the API URL through a
[credential store](credentials.md#the-fetcher) fetcher, which adds the key in the `Authorization`
header on the host and removes it from every response and error, so the key reaches no record, log
event or sandbox. The server reads the secrets file only at start, so restart it to load a new key.
A deploy restarts it.
