import type { SizeLimits } from '@heynixie/definitions';
import type { FetchReply } from '@heynixie/wire';
import { z } from 'zod';
import type { SkillVendorSource } from './parse-skill-vendor-input';

export type ReadPage = (url: string) => Promise<FetchReply>;

export type CommitSignature =
  | { readonly status: 'unsigned' }
  | { readonly status: 'verified' }
  | { readonly status: 'unverified'; readonly reason: string };

interface GitHubSkill {
  readonly files: readonly { readonly path: string; readonly text: string }[];
  readonly skipped: readonly string[];

  readonly signature: CommitSignature;
}

export type GitHubSkillRead =
  | { readonly status: 'ok'; readonly skill: GitHubSkill }
  | { readonly status: 'refused'; readonly reason: string };

const commitSchema = z.object({
  sha: z.string(),
  tree: z.object({ sha: z.string() }),
  verification: z.object({ verified: z.boolean(), reason: z.string() }).optional(),
});

const treeEntrySchema = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.string(),
  sha: z.string(),
  size: z.number().optional(),
});

const treeSchema = z.object({ tree: z.array(treeEntrySchema), truncated: z.boolean() });

export async function readGitHubSkill(
  readPage: ReadPage,
  source: SkillVendorSource,
  limits: SizeLimits,
): Promise<GitHubSkillRead> {
  const api = `https://api.github.com/repos/${source.owner}/${source.name}/git`;

  const commit = await readJSON(readPage, `${api}/commits/${source.commit}`, commitSchema);

  if (commit.status === 'refused') {
    return refuseMissing(commit, `${source.repository} has no commit ${source.commit}`);
  }

  if (commit.value.sha !== source.commit) {
    return refuse(`GitHub answered with commit ${commit.value.sha}, not ${source.commit}`);
  }

  let treeSHA = commit.value.tree.sha;

  for (const part of source.path.split('/')) {
    const tree = await readJSON(readPage, `${api}/trees/${treeSHA}`, treeSchema);

    if (tree.status === 'refused') {
      return tree;
    }

    const folder = tree.value.tree.find((entry) => entry.path === part && entry.type === 'tree');

    if (folder === undefined) {
      return refuse(`${source.path} is not a folder at commit ${source.commit}`);
    }

    treeSHA = folder.sha;
  }

  const folder = await readJSON(readPage, `${api}/trees/${treeSHA}?recursive=1`, treeSchema);

  if (folder.status === 'refused') {
    return folder;
  }

  if (folder.value.truncated) {
    return refuse(`${source.path} holds more files than GitHub lists in one answer`);
  }

  const blobs = folder.value.tree.filter((entry) => entry.type !== 'tree');
  const problem = findBlobProblem(blobs, limits);

  if (problem !== null) {
    return refuse(problem);
  }

  const files: { readonly path: string; readonly text: string }[] = [];

  for (const blob of blobs.filter((entry) => !isDotPath(entry))) {
    const file = await readBlobText(readPage, source, blob);

    if (file.status === 'refused') {
      return file;
    }

    files.push({ path: blob.path, text: file.text });
  }

  return {
    status: 'ok',
    skill: {
      files,
      skipped: blobs.filter((entry) => isDotPath(entry)).map((entry) => entry.path),
      signature: pickSignature(commit.value.verification),
    },
  };
}

type JSONRead<Value> =
  | { readonly status: 'ok'; readonly value: Value }
  | { readonly status: 'refused'; readonly reason: string; readonly httpStatus: number | null };

async function readJSON<Schema extends z.ZodType>(
  readPage: ReadPage,
  url: string,
  schema: Schema,
): Promise<JSONRead<z.output<Schema>>> {
  const reply = await readPage(url);

  if (reply.kind !== 'page') {
    return { status: 'refused', reason: `${url}: ${reply.reason}`, httpStatus: null };
  }

  if (reply.status !== 200 || reply.text === null || reply.isTruncated) {
    return {
      status: 'refused',
      reason: `${url} answered with status ${String(reply.status)} and no complete JSON body`,
      httpStatus: reply.status,
    };
  }

  const parsed = schema.safeParse(parseJSON(reply.text));

  return parsed.success
    ? { status: 'ok', value: parsed.data }
    : { status: 'refused', reason: `${url} answered with JSON nixie cannot read`, httpStatus: 200 };
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type Refusal = Extract<GitHubSkillRead, { readonly status: 'refused' }>;

// GitHub answers 422 for a SHA it cannot resolve and 404 for a missing object.
function refuseMissing(
  read: Extract<JSONRead<unknown>, { readonly status: 'refused' }>,
  reason: string,
): Refusal {
  const isMissing = read.httpStatus === 404 || read.httpStatus === 422;

  return { status: 'refused', reason: isMissing ? reason : read.reason };
}

function refuse(reason: string): Refusal {
  return { status: 'refused', reason };
}

type TreeEntry = z.infer<typeof treeEntrySchema>;

function findBlobProblem(blobs: readonly TreeEntry[], limits: SizeLimits): string | null {
  const odd = blobs.find((entry) => entry.type !== 'blob' || entry.mode === '120000');

  if (odd !== undefined) {
    return `${odd.path} is a symlink or a submodule, which a skill cannot hold`;
  }

  const large = blobs.find((entry) => (entry.size ?? 0) > limits.maxFileBytes);

  if (large !== undefined) {
    return `${large.path} is past the ${String(limits.maxFileBytes)}-byte limit for a skill file`;
  }

  const total = blobs.reduce((sum, entry) => sum + (entry.size ?? 0), 0);

  return total > limits.maxTotalBytes
    ? `the skill's files are past the ${String(limits.maxTotalBytes)}-byte limit in all`
    : null;
}

function isDotPath(entry: TreeEntry): boolean {
  return entry.path.split('/').some((part) => part.startsWith('.'));
}

async function readBlobText(
  readPage: ReadPage,
  source: SkillVendorSource,
  blob: TreeEntry,
): Promise<{ readonly status: 'ok'; readonly text: string } | Refusal> {
  const path = `${source.path}/${blob.path}`
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  const url = `https://raw.githubusercontent.com/${source.owner}/${source.name}/${source.commit}/${path}`;

  const reply = await readPage(url);

  if (reply.kind !== 'page') {
    return refuse(`${blob.path}: ${reply.reason}`);
  }

  if (reply.status !== 200 || reply.text === null || reply.isTruncated) {
    return refuse(
      `${blob.path} answered with status ${String(reply.status)} and no complete text, so it may not be a text file`,
    );
  }

  const bytes = new TextEncoder().encode(reply.text);

  if (buildBlobHash(bytes, source.commit.length) !== blob.sha) {
    return refuse(
      `the text nixie read for ${blob.path} differs from the file at the commit, so the file is not plain UTF-8 text`,
    );
  }

  return { status: 'ok', text: reply.text };
}

// git names a blob by the hash of a "blob <size>\0" header and its bytes, under the repository's
// hash algorithm, so a match proves the text holds the commit's exact bytes.
function buildBlobHash(bytes: Uint8Array, commitLength: number): string {
  const algorithm = commitLength === 64 ? 'sha256' : 'sha1';

  const hasher = new Bun.CryptoHasher(algorithm);

  hasher.update(`blob ${String(bytes.byteLength)}\0`);
  hasher.update(bytes);

  return hasher.digest('hex');
}

function pickSignature(
  verification: z.infer<typeof commitSchema>['verification'],
): CommitSignature {
  if (verification === undefined || verification.reason === 'unsigned') {
    return { status: 'unsigned' };
  }

  return verification.verified
    ? { status: 'verified' }
    : { status: 'unverified', reason: verification.reason };
}
