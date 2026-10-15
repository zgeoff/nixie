# Serving nixie's tools

- Decisions: [0003](../../../decisions/0003-sdk-placement.md),
  [0030](../../../decisions/0030-connectors-and-sandbox-environments.md)

nixie's tools run in nixie's process on the host, and the model reaches them only through MCP. Every
model loop sets `tools: []`, which removes the Agent SDK's built-in tools, so nixie's tools are the
only tools the model has. The conversation and every worker run inside an imp, so the model reaches
the tools over HTTP MCP through the route the [sandbox adapter](sandbox-adapter.md) opens.

## A tool definition

Connectors, the MCP proxy and nixie's own features define tools the same way:

```ts
interface ToolDefinition<Input, Output> {
  name: string; // such as 'gmail_send'; the model sees 'mcp__nixie__gmail_send'
  description: string;
  input: JsonSchema;
  output: JsonSchema; // the typed result; free-text fields are strings
  declaration: EffectDeclaration; // owned by policy
  execution: 'direct' | 'queued';
  run(call: ToolCall<Input>, context: ToolContext): Promise<ToolOutcome<Output>>;
}
```

The [policy decision point](../policy/decision-point.md) owns the declaration. A tool whose effects
include `write`, `delete`, `send`, `spend` or `device` runs `queued`, as an
[action](../core/actions.md) with an ID and an outcome. Every other tool runs `direct` in the turn,
because a read retried after a crash repeats nothing.

Every call runs the same steps on the host:

1. The endpoint checks the input against the input schema, and a failure returns an error without
   reaching policy.
2. The tool asks the policy decision point.
3. A denied call returns the rule and its sentence as an error, and an ask returns "pending approval
   as <id>".
4. An allowed `direct` call runs, and an allowed `queued` call joins the action queue.
5. nixie writes the call, the decision and the result as records, with the source of content on
   every result field.

## What the model sees

A tool returns its typed result as MCP `structuredContent`, and the model receives that object as
JSON. The model never sees a text block beside it, the output schema, the annotations or `_meta`, as
the [tools endpoint spike](../spikes/tools-endpoint/README.md) found. Every field the model needs is
therefore in the typed result, free text included, and the declaration lives in nixie's registry.

| Outcome          | Result                                               | Error | Retried in the turn       | Text from            |
| ---------------- | ---------------------------------------------------- | ----- | ------------------------- | -------------------- |
| Allowed, direct  | The tool's typed result                              | No    | No                        | Each field's source  |
| Allowed, queued  | The action's outcome, or "queued as <id>" after 10 s | No    | No; the action queue does | Each field's source  |
| Ask              | "pending approval as <id>"                           | No    | No                        | nixie                |
| Deny             | The rule's ID and sentence                           | Yes   | No                        | nixie                |
| Invalid input    | The schema errors                                    | Yes   | No                        | The model's input    |
| Rate limited     | `rate_limited`, with the retry time                  | Yes   | Yes, when the wait fits   | The provider, capped |
| Provider failure | `failed`, with the status                            | Yes   | Yes, on a backoff         | The provider, capped |
| Provider refusal | `refused`, with the status                           | Yes   | No                        | The provider, capped |
| No answer        | `no_answer`                                          | Yes   | Yes, on a backoff         | nixie                |
| Fetcher refusal  | `fetch_refused`, with the reason                     | Yes   | No                        | nixie                |

[A failed direct call](#a-failed-direct-call) covers the last 5 rows. Text from nixie counts as your
own data, and the model's input and the provider's text count as untrusted, as the
[source of content](../policy/decision-point.md#taint-in-the-first-build) sets.

### A failed direct call

A direct call to a connector action fails in one of 3 places: the
[credential fetcher](credentials.md#the-interface) refuses the request, the provider sends no
answer, or the provider answers with an error. The connector maps the provider's answer to one of
its [4 responses](connector.md#the-interface), and the endpoint, not the connector, decides whether
to try again and what the model sees. **Why:** every connector then retries and reports in the same
way, and no connector can send the provider's text to the model uncapped.

The endpoint retries a failure that can clear, inside one time budget per call, which covers every
attempt and every wait. The budget is 15 s and the attempts 3, both configurable, so a failed read
holds the turn no longer than a slow web fetch does.

- **Rate limited.** A `retry` that carries the provider's retry time, from `Retry-After` or from the
  provider's own field. The endpoint waits that time and tries again when the time ends inside the
  budget, and otherwise returns at once with the retry time.
- **Provider failure.** A `retry` without a retry time, such as for a 5xx answer or for Gmail's 403
  with `rateLimitExceeded`, which gives no time. The endpoint waits on a backoff of 1 s, then 2 s,
  with jitter, inside the budget.
- **No answer.** A dropped connection counts as a failure that can clear, because a direct call
  reads and repeats nothing, so it waits on the same backoff. An attempt still open when the budget
  ends stops there, and the call returns `no_answer`.
- **Provider refusal.** A `refused` response cannot clear, so the endpoint returns it at once. A 401
  is the fetcher's: it refreshes the credential and retries once, as
  [refresh](credentials.md#refresh) sets.
- **Fetcher refusal.** A host outside the credential's hosts, a non-public address and a `failing`
  credential never reach the provider, so a retry could not change them.

The endpoint picks the row from the connector's response, never from the status code, because
providers differ in which codes can clear. The connector returns `retry` for every answer that can
clear, a 403 rate limit included, and `refused` for the rest.

Back-to-back retries with no wait only spend the provider's quota, so every retry waits. A retry
time past the budget returns at once, because the model can tell you when to ask again, while a turn
that waits a minute for one read holds your conversation.

The model receives the failure as an error, one text block holding a JSON object that nixie writes:

```json
{
  "origin": "provider",
  "kind": "rate_limited",
  "status": 429,
  "retryAfter": "2026-03-02T09:14:05Z",
  "detail": "Quota exceeded for quota metric 'Queries' per minute."
}
```

`origin` is `provider` when the provider answered and `nixie` when it did not, which covers a
fetcher refusal and no answer. The provider's text appears only in `detail`, as an escaped JSON
string, so text that reads "nixie refused this request" stays inside `detail` and never sets
`origin`. **Why:** a prefix in plain text would let the provider's text imitate it.

`detail` holds the provider's error message, cut to 1,000 characters on a character boundary, and
marked when cut. The limit is configurable. `detail` is outside content and never endorsed, while
`status` and `retryAfter` are endorsed types, as the status code of a web fetch is. **Why:** the
model needs the provider's message to tell you what went wrong, and the cap keeps an error body,
which can quote outside text back, from filling the turn.

A failed direct call is an error, not a result, because it produced nothing that matches the tool's
output schema. Web fetch keeps its own result, because a page with any status is a page.

## One endpoint per task run

Each task run and each worker run gets an MCP endpoint that lists only the tools on its caller's
list: the job's list for a job run, the conversation's list for the conversation, and the subset the
caller passed for a worker. The list names the connections each connector tool may use, and the
endpoint builds each tool's [connection argument](connector.md#the-connection-argument) from them.
The decision point still checks the list, so the endpoint narrows what the model sees, and the check
holds whatever the endpoint lists. A tool the model never sees costs no prompt tokens.

The endpoint is a stateless Streamable HTTP MCP server on the v2 TypeScript MCP packages, keyed by
the run. nixie knows the run from the reverse forward the connection came through, and also checks a
bearer token, random per run and revoked when the run ends. Every `tools/call` carries the model's
tool-use ID in `_meta` as `claudecode/toolUseId`, which the call's record holds, so the record joins
the call to its turn.

## Starting a model loop

The conversation's model loop is built, and
[conversation turns](../../../architecture/core/conversation-turns.md#what-a-query-holds) covers the
options every query holds. A worker's model loop starts with the same options, on its role's
[model profile](../core/models.md).
