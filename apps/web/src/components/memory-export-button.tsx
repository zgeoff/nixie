import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';

const section = css({ alignItems: 'baseline', display: 'flex', gap: '2', marginBlock: '3' });

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

type NixieClient = ReturnType<typeof useNixieClient>['client'];

interface FileType {
  readonly description: string;
  readonly accept: Readonly<Record<string, readonly string[]>>;
}

const jsonTypes: readonly FileType[] = [
  { description: 'JSON file', accept: { 'application/json': ['.json'] } },
];

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

function findSaveFilePicker(): ShowSaveFilePicker | null {
  const picker = globalThis.showSaveFilePicker;

  // The browser refuses a call to the picker with no window as its receiver.
  return picker === undefined ? null : picker.bind(globalThis);
}

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

  // Some browsers download nothing from a link outside the document.
  document.body.append(link);
  link.click();
  link.remove();

  // The browser reads the download URL after the click returns.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

async function readExportBlob(client: NixieClient, actionID: string): Promise<Blob> {
  const chunks = await Array.fromAsync(readExportChunks(client, actionID));

  return new Blob(chunks, { type: 'application/json' });
}

async function* readExportChunks(client: NixieClient, actionID: string): AsyncGenerator<string> {
  const events = await client.memory.export({ clientActionID: actionID });

  let isComplete = false;

  for await (const event of events) {
    if ('chunk' in event) {
      yield event.chunk;
    } else {
      isComplete = true;
    }
  }

  if (!isComplete) {
    throw new Error('the export stream ended before the export completed');
  }
}

async function writePickedFile(
  handle: Readonly<FileSystemFileHandle>,
  client: NixieClient,
  actionID: string,
): Promise<void> {
  const file = await handle.createWritable();

  try {
    for await (const chunk of readExportChunks(client, actionID)) {
      await file.write(chunk);
    }
  } catch (error) {
    await file.abort();

    throw error;
  }

  await file.close();
}

type MutationStatus = 'idle' | 'pending' | 'success' | 'error';

function formatStatus(status: MutationStatus, outcome: ExportOutcome | undefined): string | null {
  if (status === 'pending') {
    return 'Exporting…';
  }

  return status === 'success' && outcome === 'saved' ? 'Saved the export.' : null;
}
