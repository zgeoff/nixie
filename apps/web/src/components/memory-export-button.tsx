import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';

// The export of every memory item with its history to one JSON file, saved where you pick. An
// export that fails keeps its client action ID, so the try after it is the same checked action.
export function MemoryExportButton(): ReactNode {
  const nixie = useNixieClient();
  const [actionID, setActionID] = useState(() => crypto.randomUUID());

  const exported = useMutation({
    mutationFn: () => writeExportFile(nixie.client, actionID),
    onSuccess: (outcome) => {
      if (outcome === 'saved') {
        setActionID(crypto.randomUUID());
      }
    },
  });

  return (
    <section aria-label="Export" className={section}>
      <button
        disabled={exported.isPending}
        onClick={() => {
          exported.mutate();
        }}
        type="button"
      >
        Export memory
      </button>
      <span>{formatStatus(exported.status, exported.data)}</span>
      {exported.isError ? <p role="alert">The export did not finish. Try again.</p> : null}
    </section>
  );
}

type ExportOutcome = 'saved' | 'cancelled';

type MutationStatus = 'idle' | 'pending' | 'success' | 'error';

function formatStatus(status: MutationStatus, outcome: ExportOutcome | undefined): string | null {
  if (status === 'pending') {
    return 'Exporting…';
  }

  return status === 'success' && outcome === 'saved' ? 'Saved the export.' : null;
}

const section = css({ alignItems: 'baseline', display: 'flex', gap: '2', marginBlock: '3' });

type NixieClient = ReturnType<typeof useNixieClient>['client'];

// A browser with a save picker writes the file as it streams; any other downloads it whole.
async function writeExportFile(client: NixieClient, actionID: string): Promise<ExportOutcome> {
  const fileName = `nixie-memory-${new Date().toISOString().slice(0, 10)}.json`;
  const showSaveFilePicker = findSaveFilePicker();

  if (showSaveFilePicker === null) {
    await writeDownload(client, actionID, fileName);

    return 'saved';
  }

  const handle = await showSaveFilePicker({ suggestedName: fileName, types: jsonTypes }).catch(
    (error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }

      throw error;
    },
  );

  if (handle === null) {
    return 'cancelled';
  }

  await writePickedFile(handle, client, actionID);

  return 'saved';
}

interface FileType {
  readonly description: string;
  readonly accept: Readonly<Record<string, readonly string[]>>;
}

interface SaveFilePickerOptions {
  readonly suggestedName: string;
  readonly types: readonly FileType[];
}

// the save picker of the File System Access API, which only some browsers have
type ShowSaveFilePicker = (options: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;

const jsonTypes: readonly FileType[] = [
  { description: 'JSON file', accept: { 'application/json': ['.json'] } },
];

function findSaveFilePicker(): ShowSaveFilePicker | null {
  const picker: unknown = Reflect.get(globalThis, 'showSaveFilePicker');

  // the picker is a method of the window, which refuses a call with no window as its receiver
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the DOM types lack the picker
  return typeof picker === 'function' ? (picker.bind(globalThis) as ShowSaveFilePicker) : null;
}

async function readExportBlob(client: NixieClient, actionID: string): Promise<Blob> {
  const chunks: string[] = [];

  for await (const event of await client.memory.export({ clientActionID: actionID })) {
    chunks.push(event.chunk);
  }

  return new Blob(chunks, { type: 'application/json' });
}

// the browser saves a link's download where its settings say, and asks where when set to ask
async function writeDownload(
  client: NixieClient,
  actionID: string,
  fileName: string,
): Promise<void> {
  const blob = await readExportBlob(client, actionID);

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;

  // a link outside the document downloads nothing in some browsers
  document.body.append(link);
  link.click();
  link.remove();

  // the download reads the URL after the click returns
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

// each chunk goes to the file as it arrives, and a failed export leaves the file unwritten
async function writePickedFile(
  handle: Readonly<FileSystemFileHandle>,
  client: NixieClient,
  actionID: string,
): Promise<void> {
  const file = await handle.createWritable();

  try {
    for await (const event of await client.memory.export({ clientActionID: actionID })) {
      await file.write(event.chunk);
    }
  } catch (error) {
    await file.abort();

    throw error;
  }

  await file.close();
}
