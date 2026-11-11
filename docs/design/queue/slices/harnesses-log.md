# Harnesses: the turn-input log as slices

These slices follow slices 1 to 7 in [the harness slices](harnesses.md), and have the numbers 8
and 9. The docs are [the turn-input log](../turn-input-log.md) and
[the turn-input store](../turn-input-store.md). The sketches are in `../sketches/harnesses/`. Open
items are in [the open list](../open/harnesses.md), each named here as `(open: <name>)`.

Each "Needs" line is a settled dependency. Neither slice needs slices 1 to 7. (open: harness slice
order)

Run `bun run models && bun run test:bundles` once before the unit tests of a slice. Tests are in the
unit lane unless marked. No check sends a turn to a production deployment. A rollback goes to the
last release the deployment ran
([decision 0049](../../../decisions/0049-milestone-deploys-and-the-rollback-target.md)).

Each slice has the ID `harnesses-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `harnesses-n`.
[The work list](../work-list.md) gives the build order.

### harnesses-8. The capture in the counting proxy

[The turn-input log issue](https://linear.app/zgeoff/issue/GEO-2355).

- **Outcome:** The counting proxy removes the capture tag, takes the `capture` key, and writes a
  sealed spool file for each tagged request on a spending endpoint. The wire library holds the tag,
  the spool header and a fixture.
- **Follows:** "A capture, from a step's start to its end" and "The spool file" in the turn-input
  log; `02-types.ts`, sections M and N; `03-flow.ts`, section F.
- **Needs:** nothing. (open: capture and store), (open: capture tag layout), and the Agent SDK case
  of (open: base URL path probe), which runs first.
- **Check:**
  - `bun test apps/counting-proxy/src/make-proxy-handler.test.ts`: a tagged request reaches the stub
    upstream with the tag removed and its body as it came, a request with no tag writes no spool
    file, and no log line holds a byte of the body.
  - `bun test apps/counting-proxy/src/proxy-config-schema.test.ts`: the config loads with the
    `capture` key and without it.
- **Deploy:** the proxy takes its release ahead of nixie's. A proxy of the last release returns 403
  to a tagged path and refuses the `capture` key.
- **Rollback:** ahead of a rollback of the proxy, turn the log off and remove the proxy's `capture`
  key.
- **Milestone:** 4.

### harnesses-9. The turn-input log in nixie

[The turn-input log issue](https://linear.app/zgeoff/issue/GEO-2355).

- **Outcome:** The module `turn-inputs` opens and closes captures, takes spool files in, removes
  requests on retention and on a forget, and serves the 3 host procedures and the `nixie turn-input`
  commands.
- **Follows:** every section of the turn-input log and of the turn-input store; `01-usage.ts`,
  sections D to F; `02-types.ts`, sections M to Q; `03-flow.ts`, sections F and G.
- **Needs:** harnesses-8. (open: forget and the log), (open: retention limit), (open: log default),
  (open: log roles), (open: secret in a request), (open: turnInputs procedures), (open: miss reason
  triggers). `collectOwnValues`: web-9, the secret scan of the web family, adds it, or this slice
  does when it lands first. It needs no answer on (open: production routing).
- **Migration:** appends the 2 tables `turn_inputs` and `turn_input_captures`. They do not move
  `oldest_reader`.
- **Check:**
  - `bun run test:e2e` (e2e lane), the suite `e2e/turn-input-log.test.ts` (the slice creates the
    file), with the scripted model behind a counting proxy, on a turn with no refused and no retried
    call: the logged request equals, byte for byte, the body that the scripted model received; after
    a forget, `turnInputs.open` returns no body for a request on a cleaned thread.
  - `bun test modules/turn-inputs/src/open-capture.test.ts` (the slice creates the file): with the
    log off, or for a role outside `roles`, nixie writes nothing and the base URL is the profile's
    own; a covered step on a profile that passes no capture point writes one `no_capture_point`
    miss.
  - `bun test modules/turn-inputs/src/take-in-spool-file.test.ts` (the slice creates the file): a
    `.cap` file is one file under the test's data directory and one `model.input_logged`, and no log
    line holds a byte of the body. Each row of the secret cases table is a case here or in the e2e
    suite.
  - `bun test modules/turn-inputs/src/sweep-turn-inputs.test.ts` (the slice creates the file), with
    a fixed clock: a request past the retention limit is removed, and a store past its byte bound
    drops its oldest requests.
  - `git grep -n turnInputs -- libs/contract/src/contract.ts apps/web` prints nothing.
- **Deploy:** run (open: rollback reads input records) ahead of the log's first release to a
  deployment.
- **Rollback:** in this order. Run `nixie turn-input off --drop`, because the last release ignores
  the `turn-inputs` folder and its forget does not reach it. Remove the `turn_input_log` section,
  because that release's strict config schema refuses it. That release never reads the 2 tables, and
  its host commands get the socket's not-found for the 3 procedures.
- **Milestone:** 4.
