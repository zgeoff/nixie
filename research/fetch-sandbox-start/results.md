# Spike results: how a fetch sandbox starts

This spike times the ways a fetch sandbox can start on a production impd host: a plain `imp new`
from the fetch image, `imp new` from a template, `imp fork`, a wake of a kept imp, and an exec in an
awake imp. On impd 2.8.3, a plain `imp new` to a first exec takes a median of 1.24 s over 5 runs,
984 to 1379 ms. A template or a fork gains nothing within the spread of those runs. A kept imp that
wakes costs 0.56 s, and an exec in an awake imp 0.11 s. The answer is one new sandbox per fetch from
the fetch image, with no template, fork or pool. The
[web fetch design](../../docs/design/platform/connectors/web-fetch.md#the-sandboxs-lifetime) makes
that the default once its cost is measured. Every one of the 22 timed creates exited 0, the 5 from
the conversation image included.

## Question

1. What does a fresh fetch sandbox cost on the impd that nixie runs on, from the create to a first
   command in the guest?
2. Does a faster start fit the design: a warm pool of awake imps, a sandbox kept per conversation,
   or `imp new` from a template or a fork?
3. How many imps are awake on the host during each run, so host load can be told apart?
4. Does `imp new` exit 1 on the conversation image while the imp starts, and can a fetch trust the
   exit code of the create?

## Setup

| Component    | Version                                      |
| ------------ | -------------------------------------------- |
| impd         | 2.8.3, the production host                   |
| imp CLI      | 0.38.1                                       |
| Fetch image  | `nixie-fetch-aeb91d2186e6`                   |
| Conversation | `nixie-conversation-067a74167117`            |
| Fetch shape  | 1 vCPU, 512 MiB, 4 GiB disk, `public` egress |
| Conversation | 2 vCPUs, 2 GiB, 4 GiB disk, `box` egress     |

[`time-starts.sh`](time-starts.sh) needs bash, coreutils and the imp CLI logged in to the impd under
test. It takes every time from the host clock around one CLI call, so each figure includes the CLI's
own start and its round trip to impd. It creates only imps and one template named with the
`geo1337-` prefix, refuses to start when one exists, keeps at most one of them awake while it times,
and removes all of them on exit.

The script first makes 2 warm-up imps of the fetch shape, so impd holds a
[boot template](https://github.com/zgeoff/impz/blob/v2.8.3/docs/architecture/lifecycle/boot-templates.md)
for it. It then prepares `geo1337-src`, a fetch imp that it stops and makes the
[template](https://github.com/zgeoff/impz/blob/v2.8.3/docs/guides/templates.md) `geo1337-tpl` from,
and `geo1337-keep`, a fetch imp that it puts to sleep. Each of the 5 runs then times these routes in
turn, so a drift in host load reaches all of them alike:

| Route      | What it times                                                                |
| ---------- | ---------------------------------------------------------------------------- |
| `new`      | `imp new` from the fetch image, then `imp exec -- true`                      |
| `template` | `imp new` from `geo1337-tpl`, then `imp exec -- true`                        |
| `fork`     | `imp fork` of the stopped `geo1337-src`, then `imp exec -- true`             |
| `wake`     | `imp wake` of the sleeping `geo1337-keep`, then `imp exec -- true`           |
| `warm`     | a second `imp exec -- true` in `geo1337-keep` while it is awake              |
| `conv`     | `imp new` from the conversation image, then `imp exec -- true`, for its exit |

Each create route then removes its imp with `imp rm`, and the `wake` route puts `geo1337-keep` back
to sleep. Every row records impd's version and the host's awake imp count before the route, from
`imp info`. The count covers every imp on the host, so the `warm` row counts `geo1337-keep` too.

The fetch shape leaves out the backup opt-out that nixie's imp adapter sets, because the 0.38.1 CLI
has no flag for it. A backup runs apart from a boot.

### Running it

1. Log the imp CLI in to the impd under test, and find the image names with `imp image ls`.
2. From the repo root, run the script with the fetch image, and the conversation image if impd holds
   one:

   ```bash
   FETCH_IMAGE=<fetch_image> CONVERSATION_IMAGE=<conversation_image> RUNS=5 \
     bash research/fetch-sandbox-start/time-starts.sh > <output_file> 2>&1
   ```

   Expect exit 0 and one table row per route and run in `<output_file>`, in about 10 minutes.

3. Confirm that nothing remains: `imp ls | grep geo1337-` and `imp template ls | grep geo1337-` each
   print nothing.

## Answer

Every create, wake and exec exited 0. The host had 8 imps awake before each `warm` route, which
counts `geo1337-keep` after its wake, and 7 before each of the other routes. Times are in
milliseconds.

| Route      | Create median | Wake median | First exec median | Total median | Total range |
| ---------- | ------------: | ----------: | ----------------: | -----------: | ----------: |
| `new`      |          1005 |           — |               158 |         1244 |  984 – 1379 |
| `template` |           972 |           — |               153 |         1117 | 1009 – 1508 |
| `fork`     |           894 |           — |               142 |         1041 |  948 – 1388 |
| `wake`     |             — |         347 |               192 |          558 |   519 – 881 |
| `warm`     |             — |           — |               107 |          107 |   102 – 114 |
| `conv`     |          1443 |           — |               241 |         1684 | 1377 – 2744 |

The two warm-up creates took 2896 and 1229 ms to a first exec, so the first create of a shape after
impd starts costs about 2.9 s. `imp template create` took 528 ms, once. `imp rm` of a `new` imp took
a median of 619 ms, after the fetch is done.

### A fresh sandbox per fetch

A plain `imp new` reaches a first command in about 1.2 s, against the 0.5 to 0.9 s that the
[worker cold start spike](../worker-cold-start/) estimated from Docker runs, and against 8.0 to 18.3
s, median 10.9 s, on impd 2.5.3 with 9 imps awake. Both the impd version and the load changed
between those runs and these, so this spike cannot split the drop between them.

The first exec of `true` is a floor for a fetch. The fetch adds the start of its fetcher process
inside the guest and the fetch itself, which this spike does not time.

### Templates and forks

A template and a fork both start from a copy of a prepared disk, and both land within the spread of
a plain `imp new`: medians of 1117 and 1041 ms against 1244 ms, with ranges that overlap. The fetch
image holds the fetcher, so a prepared disk saves nothing that a fetch would otherwise do. A
template or a fork also adds a source imp or a template that nixie must build per image and remove,
and a template copies the source's machine identity, which impd resets on the first boot.

### A warm pool or a kept sandbox

An exec in an awake imp costs about 0.1 s, so a pool of awake fetch imps cuts the start to that. The
pool holds RAM for each awake imp, and must create a replacement after each fetch, which costs the
same 1.2 s of impd's work off the fetch's path. A sandbox kept per conversation wakes in about 0.56
s, and lets every fetch in that conversation share one boundary: a page that compromises the fetcher
can see the URLs of later fetches in the same conversation. One sandbox per fetch removes that
shared boundary for about 0.7 s more than a wake.

### The exit code of `imp new`

All 5 creates from the conversation image exited 0 on impd 2.8.3, and so did the 17 timed creates
and forks of the fetch shape. The exit 1 seen on impd 2.5.3 did not recur, so this spike holds no
evidence of its cause. A change in impd between 2.5.3 and 2.8.3 is a suspected cause, not a shown
one.

nixie never reads that exit code. The imp adapter calls impd's create through the imp client, and on
any failure of the create or the setup after it, the adapter removes the imp and records the sandbox
as destroyed. A create that fails while the imp comes up therefore fails one fetch and leaves no imp
behind.

## Per run

The script's output, with the warm-up runs `w1` and `w2`.

| Route    | Run | Awake | Create | Wake | Exec | Total |  rm |
| -------- | --- | ----: | -----: | ---: | ---: | ----: | --: |
| new      | w1  |     7 |   2757 |    0 |  139 |  2896 | 760 |
| new      | w2  |     7 |   1067 |    0 |  162 |  1229 | 588 |
| new      | 1   |     7 |    848 |    0 |  136 |   984 | 619 |
| template | 1   |     7 |    960 |    0 |  142 |  1102 | 637 |
| fork     | 1   |     7 |   1246 |    0 |  142 |  1388 | 717 |
| wake     | 1   |     7 |      0 |  329 |  229 |   558 |   — |
| warm     | 1   |     8 |      0 |    0 |  114 |   114 |   — |
| conv     | 1   |     7 |   1943 |    0 |  174 |  2117 | 713 |
| new      | 2   |     7 |   1005 |    0 |  158 |  1163 | 621 |
| template | 2   |     7 |   1034 |    0 |  474 |  1508 | 654 |
| fork     | 2   |     7 |    935 |    0 |  142 |  1077 | 615 |
| wake     | 2   |     7 |      0 |  347 |  192 |   539 |   — |
| warm     | 2   |     8 |      0 |    0 |  102 |   102 |   — |
| conv     | 2   |     7 |   2486 |    0 |  258 |  2744 | 566 |
| new      | 3   |     7 |   1082 |    0 |  162 |  1244 | 897 |
| template | 3   |     7 |    972 |    0 |  153 |  1125 | 589 |
| fork     | 3   |     7 |    812 |    0 |  136 |   948 | 516 |
| wake     | 3   |     7 |      0 |  691 |  190 |   881 |   — |
| warm     | 3   |     8 |      0 |    0 |  109 |   109 |   — |
| conv     | 3   |     7 |   1378 |    0 |  257 |  1635 | 646 |
| new      | 4   |     7 |    954 |    0 |  425 |  1379 | 529 |
| template | 4   |     7 |    975 |    0 |  142 |  1117 | 521 |
| fork     | 4   |     7 |    894 |    0 |  147 |  1041 | 535 |
| wake     | 4   |     7 |      0 |  368 |  212 |   580 |   — |
| warm     | 4   |     8 |      0 |    0 |  106 |   106 |   — |
| conv     | 4   |     7 |   1443 |    0 |  241 |  1684 | 615 |
| new      | 5   |     7 |   1229 |    0 |  137 |  1366 | 579 |
| template | 5   |     7 |    856 |    0 |  153 |  1009 | 583 |
| fork     | 5   |     7 |    824 |    0 |  142 |   966 | 923 |
| wake     | 5   |     7 |      0 |  328 |  191 |   519 |   — |
| warm     | 5   |     8 |      0 |    0 |  107 |   107 |   — |
| conv     | 5   |     7 |   1237 |    0 |  140 |  1377 | 524 |

## Untested

- The start of the fetcher process and a real fetch inside a new sandbox.
- impd 2.5.3 under the same load, which would split the drop from 10.9 s between the impd version
  and the host's load.
- More than 8 imps awake, or creates that run at the same time.
- The imp CLI 2.x, and the backup opt-out that nixie sets.
