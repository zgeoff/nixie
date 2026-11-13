# The code tool

- **Status:** draft
- **Work items:** [the code tool](https://linear.app/zgeoff/issue/GEO-1841)
- **Decision records:** [0017](../../decisions/0017-a-code-run-gets-a-fresh-sandbox.md)

`code.run` runs a short program, such as a calculation, a file conversion or a chart, and returns
its output and the files it wrote. Every code run gets a fresh sandbox from the code image, with no
network, no grant and no tool route, and nixie destroys the sandbox when the call returns. The
caller can be the conversation, a task or a worker. The files a code run writes are attachments of
its result record, so a forget of that record makes them unreadable, and a later code run reads them
by a short file ID.

This design changes the code tool section of the
[coding design](../platform/connectors/coding.md#the-code-tool), and adds the `code` key to
[the image set](sandbox-image-set.md) and the `codeRun` row to [the size table](sandbox-sizes.md).

## Shape

```mermaid
flowchart LR
  model[model] -->|"code.run"| endpoint[tool endpoint]
  endpoint -->|"code_run effect"| policy[decision point]
  endpoint --> tool[code tool on the host]
  tool -->|"read file IDs"| store[(attachments and code_files)]
  tool -->|"create: code image, codeRun row"| sandbox[code sandbox]
  tool -->|"copy in, exec, copy out"| sandbox
  tool -->|destroy| sandbox
  tool -->|"result, files as attachments"| endpoint
  endpoint -->|"tool_result in one transaction"| store
```

## Contracts

### The call

```ts
code.run({
  language: 'python',
  program: "import pandas as pd\ndf = pd.read_csv('orders.csv')\n…\nplt.savefig('out/totals.png')",
  files: [{ path: 'orders.csv', file: 'f8k2m4q9za' }],
  skills: ['pdf-forms'],
});
// → {
//     exitCode: 0,
//     stdout: { text: 'north 412.50\nsouth 380.00\n', bytes: 28, isCut: false, file: null },
//     stderr: { text: '', bytes: 0, isCut: false, file: null },
//     files: [{ file: 'p3n8x2c7ke', path: 'out/totals.png', bytes: 48213,
//               mediaType: 'image/png', isShown: true }],
//     limit: null,
//     seconds: 2.4,
//   }
// A limit the program reached still returns its result:
//   { exitCode: null, …, limit: { kind: 'wall_time',
//     sentence: 'The program ran past its limit of 60 s, so nixie stopped it.' } }
// A refusal before the program starts is a tool error, such as:
//   'No file f8k2m4q9za belongs to this thread.'
```

```ts
// connectors module. The input schema is strict.
interface CodeRunInput {
  language: 'python' | 'javascript' | 'typescript' | 'bash';
  program: string; // 1 to 100,000 characters
  files?: CodeRunFileInput[]; // at most 50, each path once
  skills?: string[]; // at most 10 distinct names, each on the caller's pinned skill list
}

type CodeRunFileInput =
  | { path: string; file: string } // a file an earlier code run on this thread wrote
  | { path: string; page: string }; // a stored web page of this session, its text as stored

// path: relative to the work folder, 1 to 200 characters of [A-Za-z0-9._/-], with no segment
// that is empty, '.' or '..', and never under 'out/'.

interface CodeRunResult {
  exitCode: number | null; // null when the program ended on a signal
  stdout: CodeRunStream;
  stderr: CodeRunStream;
  files: CodeRunFile[]; // the files under out/, in path order; empty on a 'files' limit
  limit: CodeRunLimitHit | null;
  seconds: number; // the program's own time, 1 decimal place
}

interface CodeRunStream {
  text: string; // the first 32 KiB, decoded as UTF-8 with replacement
  bytes: number; // every byte the program wrote to the stream
  isCut: boolean; // the stream passed 1 MiB, and nixie kept the first 1 MiB
  file: string | null; // when bytes passes 32 KiB: the file ID of the kept stream
}

interface CodeRunFile {
  file: string; // a short ID from createShortID
  path: string; // relative to the work folder, such as 'out/totals.png'
  bytes: number;
  mediaType: string;
  isShown: boolean; // the model received the file as an image beside this result
}

interface CodeRunLimitHit {
  kind: 'wall_time' | 'memory' | 'output' | 'files';
  sentence: string; // from the table in Constraints
}
```

```ts
// connectors module, the tool definition
const codeRunDeclaration: EffectDeclaration = {
  effects: ['code_run'],
  destinations: [],
  amount: null,
  content: ['program'],
  results: {
    exitCode: 'untrusted',
    stdout: 'untrusted',
    stderr: 'untrusted',
    files: 'untrusted',
    limit: 'untrusted',
    seconds: 'untrusted',
  },
};
// execution: 'direct'. A code run reaches nothing outside nixie, so a rerun repeats nothing.
```

### The limits

```ts
// connectors module. Constants, with no config key and no definition key.
export const codeRunLimits = {
  wallTimeMs: 60_000, // the program, from its start to its exit
  callMs: 120_000, // the whole call: create, copy in, the program, copy out, destroy
  streamBytes: 1024 * 1024, // per stream, the built exec cap
  shownStreamBytes: 32 * 1024, // per stream, in the result's text
  inputBytes: 64 * 1024 * 1024, // the program, every input file and every skill file
  outputFiles: 50,
  outputBytes: 20 * 1024 * 1024, // every file under out/
  shownImages: 4,
  runsAtOnce: 2, // in one server process
} as const;
```

```ts
// sandbox module, a new row in the built size table. memoryMiB is in MiB.
export const sandboxSizes = {
  // …existing rows
  codeRun: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
} as const satisfies Readonly<Record<string, SandboxLimits>>;
```

### The files

```text
code_files: one row per file a code run wrote, written in the transaction of its tool_result
  file_id      text primary key   -- the short ID the model reads and passes
  thread       text not null      -- the result record's thread
  sequence     integer not null   -- references records (sequence): the tool_result record
  position     integer not null   -- the attachment's position on that record
  bytes        integer not null
  media_type   text not null
-- No path and no other free text: the path sits in the result's erasable fields.
```

```ts
// tools module, built types extended
interface DirectResult extends TypedResult {
  // …existing fields
  // Sealed under the result record's key, in order, as record attachments.
  readonly attachments?: readonly Uint8Array<ArrayBuffer>[];
  // Runs inside the result record's write transaction, with that record's sequence.
  readonly writeBeside?: (tx: WriteTransaction, resultSequence: number) => Promise<void>;
}
```

### The image

```ts
// sandbox module, the built tuple and records
export const sandboxImageKeys = ['conversation', 'fetch', 'code'] as const;
// sandboxImageRecords.code: { repository: 'nixie-code', dockerfile: <beside the other guests> }

// The code_run part declares its image. Every deployment needs the code image.
images: () => ['code'],
```

The code image is Python 3.13 on a slim Debian base, about 690 MB on disk, with:

| Group        | Holds                                                                                   |
| ------------ | --------------------------------------------------------------------------------------- |
| Python       | numpy, pandas, scipy, duckdb, matplotlib with Pillow, openpyxl, pdfplumber, python-docx |
| JavaScript   | Bun, for `javascript` and `typescript`                                                  |
| Command line | bash, sqlite, jq, ripgrep, git, and the common file and text tools                      |

The image holds no package installer, no ffmpeg, no polars and no ImageMagick. The build pins every
version, and a non-root user `code` runs the program.

### What the model reads

The tool's description holds these facts, because the model sees only the name, the description and
the input schema:

- The program has no network, no credentials and no route to nixie's tools. It gets outside data
  only through a file input.
- What the image holds, from the table above, and that nothing can be installed.
- pandas reads a CSV of up to about 90 MB in the 512 MiB of memory. For a larger CSV, the program
  uses duckdb, which spills to disk.
- Each limit, with its figure.
- The program writes the files it returns under `out/`, and reads its inputs at their paths in the
  work folder, and each skill at `/skills/<name>/`.

## Constraints

The sandbox:

- Each code run creates its own sandbox of kind `code_run`, from the code image at the `codeRun`
  row, with egress `none`, no grant and no tool route. No code run reuses a sandbox, the caller's
  included.
- The sandbox's owner is `code_run:<callID>`. The built start recovery destroys every sandbox whose
  owner it does not keep, so a code sandbox left by a crash goes at the next start.
- nixie destroys the sandbox on every way out of the call, a refusal after the create and a thrown
  error included. A failed destroy is logged, and start recovery removes the sandbox.
- The program runs as the user `code`, in the work folder `/work`. Each input file lands at
  `/work/<path>`, the program at a path outside `/work`, and each skill folder at `/skills/<name>/`
  owned by root and read-only to `code`.
- `language` picks the command: `python3` for `python`, `bun` for `javascript` and `typescript`,
  `bash` for `bash`.
- When `runsAtOnce` code runs already run, a call gets the error "2 code runs already run, which is
  the most at once. Call again when one has returned." and creates nothing.

The limits:

- Each limit the program reaches gives the result its `limit` and the sentence below. The checks run
  in table order, and the result holds the first one hit.

| `kind`      | When                                                  | Sentence                                                                                                             |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `wall_time` | the program runs 60 s; nixie stops it                 | The program ran past its limit of 60 s, so nixie stopped it.                                                         |
| `memory`    | the guest's memory-kill count rose during the program | The program ran out of its 512 MiB of memory. For a large CSV, read it with duckdb.                                  |
| `output`    | a stream passed 1 MiB                                 | The program wrote more than 1 MiB to {stream}, and nixie kept the first 1 MiB.                                       |
| `files`     | out/ holds more than 50 files or more than 20 MiB     | The program wrote {count} files of {size} under out/, past the limit of 50 files and 20 MiB, so nixie returned none. |

- The memory check reads the count through `readMemoryKills` from
  [the memory-kill signal](memory-kill-signal.md), before and after the program. A count that cannot
  be read gives no `memory` limit.
- A code run's memory kill is the program's limit, and never a sign that the `codeRun` row is too
  small.
- The whole call ends within `callMs`. Past it, nixie destroys the sandbox, and the call returns the
  tool error "The code run took more than 120 s, so nixie stopped it." The runtime's own wait for a
  tool call follows [the tool-call wait](tool-call-wait.md).

The refusals, each a tool error before the program starts:

- A `file` that is not in `code_files`, or whose row holds another thread: "No file {file} belongs
  to this thread."
- A `file` whose record reads as shredded or unreadable: "The file {file} was forgotten."
- A `page` that the call's session does not hold, or a call with no session: "No page {page} is
  stored in this session." The model then fetches the page again.
- A skill outside the caller's pinned list: "No skill {name} is on this task's list."
- Inputs past `inputBytes`: "The inputs come to {size}, past the limit of 64 MiB."
- A sandbox that fails to start: "nixie could not start the code sandbox. A second call starts a new
  one."

The files:

- The host lists `/work/out/` after the program ends, and copies nothing out when the list passes
  either `files` limit.
- When a stream passes 32 KiB, nixie keeps the stream, up to 1 MiB, as a file with the path
  `.stdout` or `.stderr`. The two stream files count toward neither `files` limit.
- Each file the result returns is one attachment of the `tool_result` record, and one `code_files`
  row written in the same transaction. A file never sits in a payload or in an erasable field.
- A file ID resolves only on its own thread. A worker's tool calls write their records on the
  caller's thread, so the caller reads the files of its worker's code runs.
- `mediaType` comes from the file's bytes for PNG, JPEG, GIF and WebP, else from its extension, else
  `application/octet-stream`.
- Up to 4 image files reach the model beside the result, each fitted as the web fetch fits an image,
  and each one counts against the session's images through `reserveImages`. When the call has no
  `reserveImages`, or the session refuses an image, the file's `isShown` is false.
- The result record's form adds each skill's name and content hash, and the sandbox ID.
- A forget of the `tool_result` record makes its files unreadable with its text. The `code_files`
  row stays, and the next use of its ID gets the "forgotten" refusal.
- Each code run can add up to 22 MiB to `nixie.db` and to each backup: 20 MiB of files and two
  stream files of 1 MiB.

The image and the release:

- The `code` key follows every rule of [the image set](sandbox-image-set.md): its record, the
  `code_run` part's `images`, a release job, an Images build step and a public registry package.
- The `codeRun` row follows [the size table](sandbox-sizes.md), and its 512 MiB covers the highest
  peak that the image's probe measured, 278 MiB for pandas reading a 55 MB CSV.

### A rollback

The release a rollback returns to lacks the code tool. What it does with each thing this design
adds:

| Added                                                 | The release before                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| the `code_files` migration                            | runs on it unchanged, because the migration only adds a table, and never reads the table                                 |
| attachments of a `tool_result`                        | never reads them; a forget of the record still deletes the key that seals them                                           |
| `tool_called` and `tool_result` records of `code.run` | reads them as it reads any tool record                                                                                   |
| `sandbox.created` of kind `code_run`                  | reads it, because the built kind list holds `code_run`; its start recovery destroys the sandbox                          |
| the `code` image key and the `codeRun` row            | never meets them: each release's nixie image holds its own manifest, and a size is a constant                            |
| a started task with `code.run` on its tool list       | keeps the list, and the registry stage denies each call of `code.run`                                                    |
| a definition that lists `code.run`                    | refuses its start as `wider_tools`, so a definitions seed refuses as `start_refused` and keeps the last seed it accepted |

- A rollback that needs new definitions seeds takes `code.run` out of each definition first.

## Decisions

- **A code run from a worker gets a fresh code sandbox, as from any other caller.** Every code run
  gets the same image and limits, the worker keeps the smaller conversation image, and the worker's
  model credential and context stay out of the program's reach.
  [0017](../../decisions/0017-a-code-run-gets-a-fresh-sandbox.md)
- **The code run's files are attachments of its result record.** A forget of that one record then
  makes its files unreadable in every copy, backups included, with no store of its own to clean.
- **A code run's limits are constants, with no definition key.** An agent's call on 13 Nov: the size
  table rules out a size per job, and a new `task.yaml` key would make every older release refuse
  the whole seed. A task that needs more waits for a measured reason to raise a constant.
- **A file ID resolves only on its own thread.** An agent's call on 13 Nov: the smallest scope that
  serves a task and its workers. Passing a file between threads waits for a need.
- **Input files are earlier code runs' files and stored web pages.** An agent's call on 13 Nov:
  these are the only bytes nixie holds under a short ID. The images you send carry a marker ID that
  changes on each render, so they are not inputs.
- **The result shows 32 KiB of each stream and keeps up to 1 MiB as a file.** An agent's call on 13
  Nov: 1 MiB of text in one result would fill most of a model's context, and the kept file lets the
  next code run read the rest.
- **At most 2 code runs at once, and a third is refused.** An agent's call on 13 Nov: each code run
  holds 512 MiB of host memory, and a refusal is easier to reason about than a queue inside a tool
  call.
- **Every deployment pulls the code image, with no config switch.** An agent's call on 13 Nov: a
  switch is a config key that a rollback must remove first, for an image of about 690 MB.

## Builder decides

- The name and place of the code image's Dockerfile, beside the other guest images.
- How nixie sets the skill folders read-only and runs the program as `code`.
- The extension table for `mediaType`, and how the host lists `out/`.
- Test names and layout, and the wording of the tool's description.

## Out of scope

- How a file a code run writes reaches you. Until the owner settles it in
  [the code tool](https://linear.app/zgeoff/issue/GEO-1841), the files reach only the model.
- The images you send as inputs, until the image marker carries a stable file ID.
- Network access, a package installer, and an image or size per caller.
- Coding sessions, which the [coding design](../platform/connectors/coding.md#the-coding-adapter)
  covers.
