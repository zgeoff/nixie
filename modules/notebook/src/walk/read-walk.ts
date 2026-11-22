import type { JSONObject } from '@heynixie/log';
import { readMomentLabels } from '@heynixie/memory';
import { recallPageLimitBytes } from '@heynixie/wire';
import type { NoteIndex } from '../index/start-note-index';
import { readLinkReasons } from '../link/read-link-reasons';
import type { TargetInfo } from '../link/read-target-infos';
import { buildTargetKey, readTargetInfos } from '../link/read-target-infos';
import { formatUTC } from '../note/format-utc';
import { readActiveNoteRow } from '../note/read-note-row';
import type { LinkRow, LinkType, NotebookContext, NotebookTables } from '../types';
import type { WalkNode } from './collect-neighbors';
import { collectNeighbors } from './collect-neighbors';

export interface WalkRequest {
  readonly from: string;
  readonly hops: number;
  readonly types?: readonly LinkType[];
}

// What the caller's tool list lets a node show.
export interface WalkAccess {
  // the thread whose events a node may show, and whether the caller reads the log
  readonly logThread: string;
  readonly canReadLog: boolean;
  readonly canRecall: boolean;
}

export type NoteWalk =
  | { readonly status: 'unknown' }
  | { readonly status: 'walked'; readonly result: JSONObject };

// A breadth-first walk that visits each node once and follows links both ways. It answers
// references and labels, never the text of a note, an item, a moment or a record.
export async function readWalk(
  context: NotebookContext,
  index: NoteIndex,
  access: WalkAccess,
  request: WalkRequest,
): Promise<NoteWalk> {
  const db = context.log.writer.db.$extendTables<NotebookTables>();

  const start = await readActiveNoteRow(context.log.writer.db, request.from);

  if (start === null) {
    return { status: 'unknown' };
  }

  const active = new Set(index.listMetas().map((meta) => meta.noteID));

  const allLinks = await db.selectFrom('notebook_links').selectAll().execute();

  const links = allLinks.filter((link) => active.has(link.from_note_id));

  const walked = await readWalkLevels(context, links, { kind: 'note', id: start.note_id }, request);
  const nodes = await readWalkNodes(context, index, access, walked.nodes);
  const reasons = await readReasons(context, walked.traversed);

  const infos = walked.infos;

  const linkEntries = walked.traversed.map((link) => ({
    link,
    entry: {
      from: infos.get(buildTargetKey({ kind: 'note', id: link.from_note_id }))?.shownID ?? '',
      to: {
        [link.target_kind]:
          infos.get(buildTargetKey({ kind: link.target_kind, id: link.target_id }))?.shownID ?? '',
      },
      type: link.type,
      ...(link.reason_seq === null || !reasons.has(link.reason_seq)
        ? {}
        : { reason: reasons.get(link.reason_seq) ?? '' }),
    },
  }));

  const gone = walked.gone.map((node) => ({
    [node.kind]: infos.get(buildTargetKey(node))?.shownID ?? node.id,
  }));

  return {
    status: 'walked',
    result: fitWalk(nodes, linkEntries, gone, walked.isCut),
  };
}

interface Walked {
  readonly nodes: readonly (WalkNode & { readonly hops: number })[];
  readonly traversed: readonly LinkRow[];
  readonly gone: readonly WalkNode[];
  readonly infos: ReadonlyMap<string, TargetInfo>;
  readonly isCut: boolean;
}

const maxNodes = 200;

// One level at a time, so each level reads the state of its new nodes in one batch.
async function readWalkLevels(
  context: NotebookContext,
  links: readonly LinkRow[],
  start: WalkNode,
  request: WalkRequest,
): Promise<Walked> {
  const nodes: (WalkNode & { hops: number })[] = [{ ...start, hops: 0 }];

  const seen = new Set([buildTargetKey(start)]);
  const traversed = new Map<string, LinkRow>();

  const gone: WalkNode[] = [];

  const infos = new Map<string, TargetInfo>();

  let frontier: readonly WalkNode[] = [start];
  let isCut = false;

  const startInfos = await readTargetInfos(context, [start]);

  for (const [key, info] of startInfos) {
    infos.set(key, info);
  }

  for (let hops = 1; hops <= request.hops && frontier.length > 0 && !isCut; hops += 1) {
    const found = frontier.flatMap((node) => collectNeighbors(links, node, request.types));
    const fresh = found.filter((neighbor) => !seen.has(buildTargetKey(neighbor.node)));

    const levelInfos = await readTargetInfos(
      context,
      fresh.map((neighbor) => neighbor.node),
    );

    for (const [key, info] of levelInfos) {
      infos.set(key, info);
    }

    const next: WalkNode[] = [];

    for (const neighbor of found) {
      const key = buildTargetKey(neighbor.node);
      const info = infos.get(key);

      traversed.set(neighbor.link.link_key, neighbor.link);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      if (info?.isGone ?? true) {
        gone.push(neighbor.node);
        continue;
      }

      if (nodes.length >= maxNodes) {
        isCut = true;
        break;
      }

      nodes.push({ ...neighbor.node, hops });
      next.push(neighbor.node);
    }

    frontier = next;
  }

  // the sources of the traversed links are notes whose short IDs the entries show
  const sources = [...traversed.values()].map((link) => ({
    kind: 'note' as const,
    id: link.from_note_id,
  }));

  const sourceInfos = await readTargetInfos(context, sources);

  for (const [key, info] of sourceInfos) {
    infos.set(key, info);
  }

  return { nodes, traversed: [...traversed.values()], gone, infos, isCut };
}

const roles: Readonly<Record<string, string>> = {
  owner_message: 'owner',
  'model.reply': 'assistant',
  tool_result: 'tool',
  task_message: 'task',
};

async function readWalkNodes(
  context: NotebookContext,
  index: NoteIndex,
  access: WalkAccess,
  nodes: readonly (WalkNode & { readonly hops: number })[],
): Promise<readonly JSONObject[]> {
  const infos = await readTargetInfos(context, nodes);

  const moments = await readMomentLabels(
    context.log,
    nodes.filter((node) => node.kind === 'moment').map((node) => node.id),
  );

  return Promise.all(
    nodes.map(async (node): Promise<JSONObject> => {
      const info = infos.get(buildTargetKey(node));
      const shown = info?.shownID ?? node.id;

      if (node.kind === 'note') {
        return { note: shown, hops: node.hops, title: index.findMeta(node.id)?.title ?? '' };
      }

      if (node.kind === 'memory') {
        const gist = access.canRecall ? await context.memory.readGist(node.id) : null;

        return {
          memory: shown,
          hops: node.hops,
          ...(gist === null ? {} : { gist }),
          state: info?.state ?? 'active',
        };
      }

      if (node.kind === 'moment') {
        const label = moments.get(node.id);

        return {
          moment: shown,
          hops: node.hops,
          ...(label?.title === undefined || label.title === null ? {} : { title: label.title }),
          state: info?.state ?? 'active',
        };
      }

      const event = info?.event ?? null;
      const isShown = access.canReadLog && event !== null && event.thread === access.logThread;

      return {
        event: shown,
        hops: node.hops,
        ...(isShown ? { at: formatUTC(event.at), role: roles[event.kind] ?? 'tool' } : {}),
      };
    }),
  );
}

function readReasons(
  context: NotebookContext,
  links: readonly LinkRow[],
): Promise<ReadonlyMap<number, string>> {
  return readLinkReasons(
    context.log,
    links.flatMap((link) => (link.reason_seq === null ? [] : [link.reason_seq])),
  );
}

interface LinkEntry {
  readonly link: LinkRow;
  readonly entry: JSONObject;
}

// Drops the deepest nodes while the result passes the output limit, so a walk that is cut says so.
function fitWalk(
  nodes: readonly JSONObject[],
  links: readonly LinkEntry[],
  gone: readonly JSONObject[],
  isCut: boolean,
): JSONObject {
  let count = nodes.length;
  let linkCount = links.length;
  let cut = isCut;

  for (;;) {
    const result: JSONObject = {
      nodes: nodes.slice(0, count),
      links: links.slice(0, linkCount).map((link) => link.entry),
      gone: [...gone],
      isCut: cut,
    };

    if (Buffer.byteLength(JSON.stringify(result)) <= recallPageLimitBytes || count <= 1) {
      return result;
    }

    count = Math.max(1, Math.floor(count * 0.9));
    linkCount = Math.floor(linkCount * 0.9);
    cut = true;
  }
}
