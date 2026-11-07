# Spike results: where each sandbox's memory goes

These are the figures behind the answer in the [README](README.md#answer).

## Terms

- **impd**: the daemon that runs nixie's sandboxes on a host. Its CLI is `impz`.
- **imp**: a Firecracker microVM that impd creates, sleeps and wakes. nixie runs each sandbox in its
  own imp, and the guest is the kernel and every process inside it.
- **Size**: the memory nixie asks impd for when it creates an imp, in MiB. nixie gives every imp a
  fixed size, which the guest's memory never grows past. impd can also give an imp room to grow,
  which nixie never asks for.
- **Pool**: host memory that the host sets aside at boot as 2 MiB huge pages, for impd's imps.
- **Passes**: every scenario at that size finishes with no out-of-memory (OOM) kill in the guest.
- **A busy deployment**: 1 conversation, 2 system tasks and 4 fetches awake at once. This spike
  started from 2048 MiB for the conversation, 1024 MiB for each system task and 512 MiB for each
  fetch, so a busy deployment took 2048 + 2 × 1024 + 4 × 512 = 6144 MiB.
- **System task**: the memory writer, the memory consolidator, the checker and the task runner.

Each fact carries a tag: [measured] for a probe in this spike, [read in the code] for nixie or impd
source, and [from a record] for an earlier impd spike.

## Question

1. Where does each sandbox's memory go: the guest kernel, the services, the runtime and the app?
   This decides which part to cut.
2. Does a smaller image save RAM, or only disk?
3. Does the SDK's host process take less memory from a bundle, a compiled binary or Bun's `--smol`?
   This decides whether to bundle.
4. Could one imp hold several fetches, or the conversation and its tasks, and what would that cost?
5. What is the smallest imp, and how much host RAM does impd set aside for an awake one?
6. What size suits each kind, and what does each change cost in security?

## Setup

| Component          | Version                                                  |
| ------------------ | -------------------------------------------------------- |
| impd               | 6.6.1, with 2 MiB huge pages on and a 20480 MiB pool     |
| impz CLI           | 4.1.0                                                    |
| Firecracker        | 1.17.0                                                   |
| Guest kernel       | 6.1.188                                                  |
| Conversation image | `ghcr.io/zgeoff/nixie-conversation@sha256:020565512163…` |
| Fetch image        | `ghcr.io/zgeoff/nixie-fetch@sha256:6dc58187e97c…`        |
| Agent SDK          | 0.3.314, with its native CLI 2.1.314                     |
| Bun                | 1.4.4                                                    |

[`probe.sh`](probe.sh) creates one test imp, copies [`guest/`](guest/) into it, runs one guest
script and removes the imp. With `MODEL_SECRET` set, `probe.sh` grants that impd secret to the test
imp alone, for the model API's `/v1/` paths, and impd revokes the grant when it removes the imp.

Each guest script runs its command under [`guest/measure.sh`](guest/measure.sh), which samples
`/proc` every 50 ms and prints each peak:

- `used` is `MemTotal` less `MemAvailable`, in MiB. It includes kernel reserves that grow with the
  imp's size, so compare `used` only at one size.
- `anon` is `AnonPages`, the guest's anonymous memory. Compare this figure across sizes.
- Each process over 5 MiB appears with its peak resident memory (RSS), which counts the pages of its
  binary that it has read. The conversation scenarios start a stub tool server, which shows as
  `mcpstub`. Production never runs it.

The scenarios:

- [`guest/turn.ts`](guest/turn.ts) runs one Agent SDK turn with the conversation guest's own query
  options.
- The short turn has a 350-token prompt. The large turn's prompt, from
  [`guest/write-large-prompt.ts`](guest/write-large-prompt.ts), comes to 232,776 input tokens. The
  resume continues the large turn's session.
- The tool loop calls a stub tool 8 times, each call returning about 40 KB, for 454,664 input tokens
  over its model calls.
- [`guest/check.sh`](guest/check.sh) sends one real check request to the guest's `check.ts` entry,
  the way the checker starts it.
- [`guest/fetch.sh`](guest/fetch.sh) reads 4 public pages through the real fetcher, one at a time
  and then all 4 at once, with a text limit 20 times nixie's default. The largest page reaches the
  fetcher's 2 MiB body cap.

## The conversation

[`guest/conversation.sh`](guest/conversation.sh) ran each scenario once per size, at 2 vCPUs. These
tables come from one set of probes, which had no OOM kill at any size [measured]. Peak anonymous
memory, in MiB:

| Size     | Short turn | Large turn | Resume | Tool loop |
| -------- | ---------- | ---------- | ------ | --------- |
| 2048 MiB | 165        | 180        | 185    | 185       |
| 512 MiB  | 166        | 182        | 186    | 185       |
| 320 MiB  | 135        | 161        | 156    | 184       |
| 256 MiB  | 155        | 159        | 151    | 163       |

Time to the result, in seconds:

| Size     | Short turn | Large turn | Resume | Tool loop |
| -------- | ---------- | ---------- | ------ | --------- |
| 2048 MiB | 3.3        | 4.6        | 2.9    | 24.3      |
| 512 MiB  | 3.8        | 9.3        | 3.2    | 26.7      |
| 320 MiB  | 6.3        | 6.1        | 5.2    | 24.4      |
| 256 MiB  | 22.5       | 33.2       | 10.8   | 79.0      |

- At 2048 MiB, the `claude` CLI process peaked at 195 to 218 MiB RSS, and the `bun` process that
  runs the SDK at 62 to 69 MiB [measured]. About 90 MiB of the CLI's RSS is pages of its binary,
  which the kernel can drop and read again, so the CLI's RSS can exceed the guest's `anon`.
- The large turn's peak is 15 to 26 MiB above the short turn's at each size above 256 MiB
  [measured]. So a 665-times larger prompt adds little, and the memory the CLI takes for any turn
  holds most of the peak [measured].
- At 320 and 256 MiB some peaks are lower than at 2048 MiB. This spike didn't find why.
- At 256 MiB the kernel drops the CLI's binary pages to make room and reads them again, so every
  turn slows, and the tool loop takes 3 times as long [measured]. In a second set of the same
  scenarios at 256 MiB, which the tables leave out, the guest OOM-killed the tool loop, and the
  large turn took 45 s [measured].
- A guest's file cache grows toward the imp's size. After a few turns at 2048 MiB, impd's imp list
  reported `ramMib` 1053 for an imp whose turns peaked under 400 MiB `used` [measured]. On 2 MiB
  pages the host never gets that memory back while the imp is awake [read in the code].

## A system task

The memory writer, the consolidator and the task runner run the same query path as the conversation,
with the same CLI and the same tool loops [read in the code]. So the conversation's figures cover
them. The checker runs the guest's `check` entry: one query with no tools [read in the code].

One check request at 384 MiB and 1 vCPU peaked at 171 MiB anonymous and 204 MiB `used`, and returned
the right verdict in 3.5 s [measured].

## A web fetch

[`guest/fetch.sh`](guest/fetch.sh) ran at each size with 1 vCPU, in one imp: each of the 4 pages
alone, then all 4 at once [measured]. nixie gives each fetch its own imp, so the single fetches set
the size, and the 4 at once size a [shared imp](#shared-imps).

| Size    | Guest's `MemTotal` | Largest single fetch, `used` | Its `anon` | 4 at once, `used` | 4 at once, `anon` | OOM kills, single | OOM kills, 4 at once |
| ------- | ------------------ | ---------------------------- | ---------- | ----------------- | ----------------- | ----------------- | -------------------- |
| 512 MiB | 480 MiB            | 101 MiB                      | 69 MiB     | 101 MiB           | 68 MiB            | 0                 | 0                    |
| 192 MiB | 164 MiB            | 90 MiB                       | 62 MiB     | 106 MiB           | 78 MiB            | 0                 | 0                    |
| 128 MiB | 102 MiB            | 91 MiB                       | 64 MiB     | 98 MiB            | 72 MiB            | 0                 | 1                    |

- The fetcher's `bun` process peaked at 37 to 87 MiB RSS, highest on the largest page [measured].
- At 128 MiB, a single fetch of the largest page left 11 MiB of `MemTotal` free [measured]. A page
  heavier than the ones tried could fail at 128 MiB, so the recommended size is 192 MiB.

## The guest and its image

[`guest/idle.sh`](guest/idle.sh) read each newly booted guest [measured]:

| Image                     | Kernel memory outside `MemTotal` | In use at boot (`MemTotal` less `MemFree`) | Anonymous at boot | On disk                                           |
| ------------------------- | -------------------------------- | ------------------------------------------ | ----------------- | ------------------------------------------------- |
| Conversation, at 2048 MiB | 59 MiB                           | 50 MiB                                     | 10 MiB            | `/usr` 182 MB, of which Bun 103 MB; `/app` 347 MB |
| Fetch, at 192 MiB         | 28 MiB                           | 42 MiB                                     | 9 MiB             | `/usr` 182 MB, of which Bun 103 MB; `/app` 1 MB   |

- The kernel's own memory outside `MemTotal` grows with the imp's size, because the kernel keeps a
  64-byte `struct page` for each 4 KiB page of guest memory.
- "In use at boot" counts the file cache, which `used` leaves out, so it is higher than `used` would
  be.
- impd boots each guest from a read-only squashfs root, with its own agent as PID 1. The images
  start no systemd and no other service [measured]. The agent's RSS was 9 to 10 MiB [measured].
- In the conversation image's `/app`, the SDK's native CLI package takes 283 MiB, almost all of it
  the 298,229,464-byte `claude` binary. `@anthropic-ai/sdk` takes 24 MB, zod 9 MB and the MCP SDK 7
  MB [measured].
- A file costs RAM only while the guest reads it, so the image's unused files cost disk and no RAM.
  About 90 MiB of the CLI's binary was resident during a turn [measured].

## The runtime

[`guest/runtime.sh`](guest/runtime.sh) ran the SDK's host process 4 ways, 3 turns each, at 512 MiB
[measured]. It then started each form 3 times with its prompt file missing, so the process loads and
exits with no model call. The start column times that, over 2 probes of `runtime.sh`.

| SDK host process                                     | Peak RSS  | Start to exit |
| ---------------------------------------------------- | --------- | ------------- |
| `bun turn.ts`, from source                           | 62–67 MiB | 214–515 ms    |
| `bun turn-bundle.js`, a `bun build` bundle of 1.3 MB | 48 MiB    | 120–387 ms    |
| `./turnbin`, from `bun build --compile`, 110 MB      | 46–48 MiB | 115–243 ms    |
| `bun --smol turn.ts`                                 | 59–66 MiB | not timed     |

- The `claude` CLI held 183 to 194 MiB in every form, and `claude --version` took 12 to 20 ms
  [measured].
- A compiled build can't find the CLI from its own path, so it needs `pathToClaudeCodeExecutable`
  [measured].
- Each start range covers the 6 starts of both probes on the same image. The slower probe ran while
  the host was busier [measured].
- Each memory range covers both probes too. The compiled build's comes from the second probe alone,
  because in the first its turns failed to start the CLI [measured].

## Shared imps

Two probes size one imp that holds several jobs [measured]:

- 3 turns at once in one 768 MiB imp, the large turn and 2 tool loops, peaked at 616 MiB `used` and
  472 MiB anonymous, with no OOM kill.
- 4 fetches at once in one imp passed at 192 MiB. At 128 MiB the guest OOM-killed one fetcher.

So a conversation with its 2 tasks fits one 768 MiB imp, and 4 fetches fit one 192 MiB imp. A busy
deployment would then take 768 + 192 = 960 MiB, about a sixth of 6144 MiB. A separate imp for each
job at the [recommended sizes](#recommended-sizes) takes a third. The cost of a shared imp is
isolation:

- impd grants a model credential per imp, so in a shared imp the conversation holds the tasks'
  credentials [read in the code].
- Fetches in one imp share its kernel, so a hostile page could reach another fetch's data. This
  spike never tested how well one imp keeps its processes apart.

## impd's side

- The smallest imp is 128 MiB [read in the code: impd `imp-create-input-schema.ts:14`].
- impd takes each size as given, with no rounding. impd boots an imp on 2 MiB pages only when its
  size is an even number of MiB and its memory can't grow past it. Any other imp boots on 4 KiB
  pages [read in the code: impd `pick-huge-pages.ts`].
- Before impd starts an imp on 2 MiB pages, impd checks that the pool has room for the imp's whole
  size. It counts the guest's untouched memory as taken [read in the code: impd `imp-vm-ops.ts:171`,
  `build-huge-pool-admission.ts:38`].
- On 2 MiB pages, a guest can't hand memory back to the host, and the host can't merge equal pages
  of 2 imps [from a record: impd `huge-pages.md`].
- On this host, impd refused a 1025 MiB imp, an odd size that needs 4 KiB pages, with
  `the RAM budget outside the huge page pool (0 MiB)`. So every imp on this host runs on the pool
  [measured].
- On 2 MiB pages, imps restored from one boot template never share its memory, because impd copies
  the template's pages into each new imp [read in the code: impd `firecracker-client.ts:322-323`].

### Huge pages at a create and a wake

[`time-starts.sh`](time-starts.sh) times 5 imps of each kind on 2 MiB pages [measured]. For each
imp, it times the create to the first command, then sleeps and wakes the imp twice and times each
wake to the first command. The host clock times each CLI call.

| Kind and size                  | Create, median | Create, range | First wake, median | Second wake, median | Wake range |
| ------------------------------ | -------------- | ------------- | ------------------ | ------------------- | ---------- |
| Fetch, 192 MiB, 1 vCPU         | 658 ms         | 585–844 ms    | 431 ms             | 463 ms              | 396–560 ms |
| Conversation, 512 MiB, 2 vCPUs | 600 ms         | 554–717 ms    | 503 ms             | 446 ms              | 393–540 ms |

impd's spikes compared the two page sizes on one host:

- A wake of an imp that sleeps between chat messages took a median of 207 ms on 4 KiB pages and 624
  ms on 2 MiB pages [from a record: impd
  [wake spike](https://github.com/zgeoff/impz/blob/284f5280a/docs/design/spikes/wake-huge-pages/results.md)].
- A restore from a boot template took a median of 1,500 ms on 4 KiB pages and 61 ms on 2 MiB pages
  [from a record: impd
  [restore spike](https://github.com/zgeoff/impz/blob/284f5280a/docs/design/spikes/uffd-2m-restore/README.md)].
- A wake on 2 MiB pages fell from 217.5 to 13 ms in a bench that reads the slept imp's memory file
  into the host page cache after each sleep. That bench ran in CI, not on the host of the wake
  spike, so its 217.5 ms baseline differs from 624 ms [from a record: impd
  [cold-read spike](https://github.com/zgeoff/impz/blob/8815d146/docs/design/spikes/wake-cold-reads/results.md)].

nixie creates a new imp for each fetch, and wakes its conversation and task imps after each wait
[read in the code: [sandboxes](../../docs/architecture/connectors/sandboxes.md)]. Every nixie imp
has a fixed size, and impd creates a fixed-size imp from a boot template when it has one [read in
the code: impd `start-cold-vm.ts:44-52`]. So 2 MiB pages speed up nixie's fetch creates, through the
faster restore, and slow its wakes.

## Recommended sizes

| Kind         | Size today | Recommended size | Peak anonymous memory measured      |
| ------------ | ---------- | ---------------- | ----------------------------------- |
| Conversation | 2048 MiB   | 512 MiB          | 186 MiB                             |
| System task  | 1024 MiB   | 384 MiB          | 186 MiB, on the conversation's path |
| Web fetch    | 512 MiB    | 192 MiB          | 69 MiB, alone                       |

A busy deployment then takes 512 + 2 × 384 + 4 × 192 = 2048 MiB, against 6144 MiB.

- The conversation passed at 320 MiB, but at 256 MiB one set of scenarios ended in an OOM kill. Real
  tool results can be larger than the stub's 40 KB, so the conversation gets 512 MiB, 2.7 times its
  peak anonymous memory.
- A system task passed a check at 384 MiB, and runs tool loops that peaked at 184 MiB anonymous in a
  320 MiB conversation imp.
- A fetch at 192 MiB passed alone and 4 at once, with room for a heavier page than any tried.
- Bundle the conversation's code with `bun build`, which cuts its `bun` process by about 15 MiB in
  each conversation and system task imp.

Smaller sizes leave each imp's isolation as it is. A turn larger than any tried could hit an OOM
kill and fail.

A bundle leaves isolation as it is too, and the image holds less code, because the bundle replaces
the source tree and the packages it includes.

impd restores an imp on 2 MiB pages through Linux's userfaultfd device, so impd's container keeps
that device while nixie's imps use 2 MiB pages. impd's own docs state that the device "widens what a
compromised process can reach".

A shared imp makes its jobs share credentials and a kernel, as [shared imps](#shared-imps) shows.

## Follow-ups

The rollout of the recommended sizes, the bundle and the host's page settings is
[GEO-2416](https://linear.app/zgeoff/issue/GEO-2416). Image size on disk belongs to
[GEO-2248](https://linear.app/zgeoff/issue/GEO-2248).

## Untested

- How well one imp keeps its processes apart, which shared imps would rely on.
- A page heavier to parse than the HTML spec at the 2 MiB body cap, and a fetch through the headless
  browser of the `fetch-headless` spike.
- A conversation turn with nixie's real tool server and its larger tool results.
- The sizes on a host with memory outside the pool, where impd would set aside only what each imp
  touches.
- The memory writer, the consolidator and the task runner each on their own.
