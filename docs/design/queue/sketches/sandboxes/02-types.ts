// Sandboxes: every agreed shape. Not compiled. No package imports this file.
// The sketches hold the shapes and the exact texts. The docs hold the rules.
// Usage: 01-usage.ts. Flows: 03-flow.ts.
//
// Names that the code has, with their built signatures, are marked "built".
// Not agreed, and so not binding:
// - The helper names inside 03-flow.ts are this sketch's own.
// - Return types, the `needs | null` parameter, the parameters of getHarnessSize, and the type
//   names FakeImpMemory, PartDeclarationImages, BuildGuestFlags and the 3 line interfaces are
//   this sketch's reading. Only the function names and what each decides are agreed.
//   (open: sketch signatures)
// - Each place marked (open: <name>) has an item in open/sandboxes.md.

// ---- A. The size table ----

// built, in the sandbox module's types
interface SandboxLimits {
  readonly vcpus: number;
  readonly memoryMiB: number;
  readonly diskMiB: number;
}

// In the sandbox module, exported from @heynixie/sandbox. The one file that holds a figure.
// A row is a role. Each memoryMiB is an even number, 128 or more.
export const sandboxSizes = {
  conversation: { vcpus: 2, memoryMiB: 512, diskMiB: 4096 },
  systemTask: { vcpus: 1, memoryMiB: 384, diskMiB: 4096 },
  fetch: { vcpus: 1, memoryMiB: 192, diskMiB: 4096 }, // the fallback, if a fetch does not fit: 256
} as const satisfies Readonly<Record<string, SandboxLimits>>;

export type SandboxSizeRow = keyof typeof sandboxSizes;

export type SandboxSizes = Readonly<Record<SandboxSizeRow, SandboxLimits>>;

export type SandboxSizeOverrides = Readonly<
  Partial<Record<SandboxSizeRow, { readonly memoryMiB: number }>>
>;

// The one way a reader gets a limit. Refuses an override that is odd or under 128, and the
// refusal holds the row's name. (open: size refusal text)
export declare function buildSandboxSizes(overrides: SandboxSizeOverrides): SandboxSizes;

// In the sessions module. `harness` is the harness record, and `use` is one of the uses that its
// `sizeRows` field names: see model-harnesses.md. (open: size rows order)
// (open: null size row)
export declare function getHarnessSize(
  sizes: SandboxSizes,
  harness: unknown,
  use: string,
): SandboxLimits;

// Figures for the rows that arrive with an image. None is in the table above.
//   codexTask     384 MiB   an estimate: the systemTask figure   (open: codex row estimate)
//   browserFetch  512 MiB   a headless page read peaks at 138 to 341 MiB of anonymous memory in
//                           a 512 MiB sandbox
//   worker        no figure a worker takes the systemTask row until a probe gives one

// ---- B. The read of memory kills on the sandbox port ----

// count: processes that the kernel ended for memory since the sandbox booted. The count never
//   falls while the sandbox is booted.
// unsupported: the adapter, or the sandbox at its size, holds no count.
// failed: the sandbox is gone, the runtime refused the read, or the read passed its limit.
export type MemoryKillRead =
  | { readonly kind: 'count'; readonly kills: number }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'failed' };

// One method beside the built ones of the Sandbox interface, in the sandbox module's types.
// It never rejects. An adapter with no count returns `unsupported` from a one-line body.
export interface Sandbox {
  readonly readMemoryKills: (signal?: AbortSignal) => Promise<MemoryKillRead>;
}

// The fake runtime of the imp adapter (startFakeImp, built) answers the adapter's read command
// from this field. It never runs that command on the test's host.
//   a number: the guest's memory.events file holds `oom_kill <number>`
//   'missing': the file or the line is absent, so the adapter returns unsupported
//   'lost': the exec rejects, so the adapter returns failed
interface FakeImpMemory {
  memoryKills: number | 'missing' | 'lost';
}

// In the sandbox module's test utils. Writes one whole number to the guest file /.memory-kills of
// a test sandbox. A stub guest can write the same file before it exits. A test sandbox with no
// such file has a count of 0.
export declare function writeMemoryKills(sandbox: Sandbox, kills: number): Promise<void>;

// ---- C. The watcher and its log lines ----

// In the sandbox module. `Logger` is the type that @heynixie/logger exports (built).
// The returned adapter has the id and the boundary of the adapter it wraps.
export declare function watchMemoryKills(
  adapter: SandboxAdapter,
  options: { readonly log: Logger; readonly readTimeoutMs?: number }, // default 2000
): SandboxAdapter;

// Each line is JSON with an `event` field, as every log line of nixie is.

// level info. Written once, when the server applies the watcher.
interface MemoryWatchLine {
  event: 'sandbox.memory_watch';
}

// level error. Written when the count rose since the last read.
interface MemoryKillLine {
  event: 'sandbox.memory_kill';
  ended: MemoryKillEnded;
  kind: SandboxKind; // from the sandbox's spec (built type)
  memoryMiB: number; // from the sandbox's spec; it names the row of the size table
  sandboxID: string;
  kills: number; // (open: kills field)
}

// level warn. Written when nixie could not judge the end.
interface MemoryKillUnknownLine {
  event: 'sandbox.memory_kill_unknown';
  ended: MemoryKillEnded; // (open: baseline line)
  kind: SandboxKind;
  memoryMiB: number;
  sandboxID: string;
  reason: MemoryKillUnknownReason;
}

// From the sandbox's kind: conversation gives turn, fetch gives fetch, every other kind gives step.
type MemoryKillEnded = 'turn' | 'step' | 'fetch';

type MemoryKillUnknownReason =
  // The adapter holds no count, or the guest holds no count at its size. (open: unsupported lines)
  | 'unsupported'
  // The read failed or passed its limit: the sandbox is gone, or the runtime is out of reach.
  | 'read_failed'
  // The first read of a found sandbox is above 0, or a count arrives with none to compare.
  | 'no_baseline'
  // The count is below the last one seen, so the guest booted again between the 2 reads.
  | 'counter_reset';

// ---- D. The image keys, the image records and the fit check ----

// In the sandbox module. A key names an image. It is no sandbox kind and no size row.
// A pull request that adds an image adds its key here.
export const sandboxImageKeys = ['conversation', 'fetch'] as const;

export type SandboxImageKey = (typeof sandboxImageKeys)[number];

// In the sandbox module.
export interface SandboxImageRecord {
  readonly repository: string; // the registry package, such as nixie-fetch
  readonly dockerfile: string; // from the repository root
}

export declare const sandboxImageRecords: Readonly<Record<SandboxImageKey, SandboxImageRecord>>;

// In the sandbox module. Generic over the key, so a test passes a tuple of its own. Product code
// names no type argument.
export interface ImageNeed<Key extends string = SandboxImageKey> {
  readonly key: Key;
  readonly neededBy: string; // for the refusal: "the profile gpt-task on the codex harness"
}

export interface ImageFit<Key extends string = SandboxImageKey> {
  readonly fits: boolean;
  readonly missing: readonly ImageNeed<Key>[];
}

export declare function checkImageFit<Key extends string = SandboxImageKey>(
  needs: readonly ImageNeed<Key>[],
  held: Readonly<Partial<Record<Key, unknown>>>,
): ImageFit<Key>;

// ---- E. The 3 outputs, and the functions between the manifest file and the printed output ----

// built: the value of one image that nixie adds to the runtime
interface SandboxImage {
  readonly name: string; // nixie-<key>-<12 hex>, the 12 hex from the image's digest
  readonly ref: string;
}

// 1. The sandbox manifest, the file /app/sandbox-manifest.json in the nixie image.
//    Each key of the tuple, optional. A release writes every key.
//    Each value: "<repository>@sha256:<digest>".
type SandboxManifestFile = Partial<Record<SandboxImageKey, string>>;

// 2. The output of `nixie sandbox-manifest`: each key that the manifest holds.
//    The output of `nixie sandbox-manifest --needed`: each key that the config needs.
type PrintedSandboxImages = Partial<Record<SandboxImageKey, SandboxImage>>;

// 3. `sandboxImages` in release.json, at `format` 1. Each key of the tuple, required.
//    Each value: "<repository>:<version>@sha256:<digest>".
type ReleaseSandboxImages = Record<SandboxImageKey, string>;

// In the server. Makes each of the 3 schemas from the tuple it is given. No schema names a key,
// and each schema refuses a key that the tuple lacks. `value` is the schema of one entry.
export declare function buildImageShape<Key extends string>(
  keys: readonly Key[],
  value: unknown,
): unknown;

// Each takes the tuple as its first argument and is generic over the tuple's key type.
// loadSandboxManifest is built with the signature (path); the tuple argument is work.
export declare function loadSandboxManifest<Key extends string>(
  keys: readonly Key[],
  path: string,
): Promise<Partial<Record<Key, SandboxImage>>>;

// Throws the refusal of section F when checkImageFit finds an image missing.
export declare function pickNeededImages<Key extends string>(
  keys: readonly Key[],
  images: Partial<Record<Key, SandboxImage>>,
  needs: readonly ImageNeed<Key>[],
): Partial<Record<Key, SandboxImage>>;

// The body of the `nixie sandbox-manifest` command.
export declare function printSandboxManifest<Key extends string>(
  keys: readonly Key[],
  images: Partial<Record<Key, SandboxImage>>,
  needs: readonly ImageNeed<Key>[] | null, // null with no --needed flag
): string;

// One need per configured profile, from its harness record, then one per key that a part
// declaration's `images(config)` returns. The profiles under `models.selectable` count.
export declare function listImageNeeds(config: DeploymentConfig): readonly ImageNeed[];

// One optional field on a part declaration of the server. A part with a sandbox names its images
// under this config.
interface PartDeclarationImages {
  readonly images?: (config: DeploymentConfig) => readonly SandboxImageKey[];
}

// In the release scripts' shared folder. `refs` maps each image job's key to its ref. Refuses, by
// name, a key of the tuple with no ref and a ref with no key. (open: manifest refusal text)
export declare function buildSandboxManifest(
  refs: Readonly<Record<string, string>>,
): SandboxManifestFile;

// ---- F. The refusal at start ----

// Thrown by pickNeededImages before any part starts, and printed by
// `nixie sandbox-manifest --needed` with a non-zero exit. For one missing image:
const refusal =
  'nixie refuses to start: the profile gpt-task on the codex harness needs the codex image, ' +
  'and the sandbox manifest holds conversation, fetch';

// As a template: `nixie refuses to start: ${neededBy} needs the ${key} image, and the sandbox
// manifest holds ${heldKeys.join(", ")}`. (open: several missing images)

// ---- G. The guest bundle ----

// What the conversation image holds, and nothing else beside its base:
//   /app/conversation/main.js
//   /app/conversation/check.js
//   /app/claude
// The layout is /app/<package>/<entry>.js. A second harness with a guest of its own takes the
// same layout under its own package name.

// The build script's flags. Both are required.
interface BuildGuestFlags {
  out: string; // --out <out_dir>: where the 2 bundles go
  cliPath: string; // --cli-path <cli_path>: the CLI's path where the bundle runs
}

// The build sets one build-time constant from --cli-path. The guest passes it to the Agent SDK as
// the option `pathToClaudeCodeExecutable`. A guest that runs from source has no such constant,
// and the SDK finds its CLI by its own lookup. The constant's name is the builder's choice.

// Beside the build script. Makes the same lookup that the pinned Agent SDK makes when
// `pathToClaudeCodeExecutable` is unset. (open: installed cli path)
export declare function findInstalledCLI(): string;

// built, in the sessions module: buildGuestCommand reads the package and the entry's file from
// the harness record. In an image its argv is ["bun", "/app/<package>/<entry>.js"].

// ---- H. The Kubernetes component ----

// built: createNixie(name, args, opts) builds the heynixie:k8s:Nixie component resource.
// The contract's form when Pulumi passes the component's dependsOn to its children:
//   createNixie("nixie", args, { dependsOn: [addSandboxImages] });
// (open: dependsOn check) (open: ordering argument)
