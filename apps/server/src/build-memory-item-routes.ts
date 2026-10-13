import type { HistoryVersion, ItemHistory, Provenance } from '@heynixie/memory';
import { z } from 'zod';
import { ControlRequestError } from './control-request-error';
import { parseControlBody } from './parse-control-body';
import type { HostMemory } from './require-host-memory';
import { requireHostMemory } from './require-host-memory';

type ReadMemory = () => HostMemory | null;

// Shows an item with its history, and writes your own change to it: an edit, a retirement, a
// restore or a pin. Each change but a pin binds to the version the caller read, so an item that
// moved on since refuses it as stale.
export function buildMemoryItemRoutes(readMemory: ReadMemory) {
  return {
    '/memory/items/:itemID': {
      // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
      GET: async (request: Bun.BunRequest<'/memory/items/:itemID'>) => {
        const history = await requireHostMemory(readMemory).readHistory(request.params.itemID);

        if (history === null) {
          throw new ControlRequestError(404, 'no memory item has that ID');
        }
        return Response.json(buildHistoryEntry(history));
      },
    },
    '/memory/items/edit': {
      // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
      POST: async (request: Request) => {
        const edit = await parseControlBody(request, editBody, editUsage);
        const ref = await requireHostMemory(readMemory).remember({
          text: edit.text,
          target: { itemID: edit.itemID, version: edit.version },
          provenance: ownerProvenance,
        });

        return Response.json(ref);
      },
    },
    '/memory/items/retire': { POST: makeVersionChange(readMemory, 'retire') },
    '/memory/items/restore': { POST: makeVersionChange(readMemory, 'restore') },
    '/memory/items/pin': {
      // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
      POST: async (request: Request) => {
        const pin = await parseControlBody(request, pinBody, pinUsage);

        await requireHostMemory(readMemory).pin({ ...pin, provenance: ownerProvenance });
        return Response.json(pin);
      },
    },
  } as const;
}

// What a host command shows of an item: its state, and each version oldest first with its text,
// or the status that says why the text is gone.
function buildHistoryEntry(history: ItemHistory) {
  return {
    itemID: history.itemID,
    state: history.state,
    versions: history.versions.map((version) => buildHistoryVersion(version)),
  };
}

function buildHistoryVersion(version: HistoryVersion) {
  return {
    version: version.version,
    change: version.change,
    state: version.state,
    origin: version.origin,
    source: version.source,
    recordedAt: new Date(version.recordedAt).toISOString(),
    status: version.status,
    text: version.status === 'readable' ? version.text : null,
  };
}

// the text of an item you write, within the bound the model's memory tools take
const itemText = z.string().max(2000).regex(/\S/u);

const versionRef = z.strictObject({
  itemID: z.string().min(1),
  version: z.int().positive(),
});

const editBody = versionRef.extend({ text: itemText });

const editUsage = 'an edit takes an itemID, the version it read, and text of 1 to 2,000 characters';

// A change through the socket comes from a shell in nixie's container, which only you reach, so it
// is your own action, as a change in the memory view is.
const ownerProvenance: Provenance = {
  origin: 'owner',
  source: 'owner',
  taskID: null,
  proposalID: null,
  checks: null,
  model: null,
};

function makeVersionChange(readMemory: ReadMemory, change: 'retire' | 'restore') {
  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
  return async (request: Request) => {
    const target = await parseControlBody(request, versionRef, versionUsage);
    const memory = requireHostMemory(readMemory);
    const ref = await memory[change]({ target, provenance: ownerProvenance });

    return Response.json(ref);
  };
}

const versionUsage = 'a retire or a restore takes an itemID and the version it read';

const pinBody = z.strictObject({ itemID: z.string().min(1), isPinned: z.boolean() });

const pinUsage = 'a pin takes an itemID and isPinned';
