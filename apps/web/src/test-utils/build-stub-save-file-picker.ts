type FileEnding = 'open' | 'closed' | 'aborted';

interface StubSavedFile {
  readonly name: string;
  readonly text: string;
  readonly ending: FileEnding;
}

interface SavePickerOptions {
  readonly suggestedName: string;
}

interface StubFileHandle {
  readonly kind: 'file';
  readonly name: string;
  readonly createWritable: () => Promise<{
    readonly write: (chunk: string) => Promise<void>;
    readonly close: () => Promise<void>;
    readonly abort: () => Promise<void>;
  }>;
}

export interface StubSaveFilePicker {
  readonly showSaveFilePicker: (options: SavePickerOptions) => Promise<StubFileHandle>;

  readonly readFiles: () => readonly StubSavedFile[];
}

interface OpenFile {
  readonly name: string;
  readonly chunks: string[];
  ending: FileEnding;
}

export function buildStubSaveFilePicker(): StubSaveFilePicker {
  const files: OpenFile[] = [];

  return {
    showSaveFilePicker(this: unknown, options) {
      // The browser refuses a call to the picker with no window as its receiver.
      if (this !== globalThis) {
        return Promise.reject(new TypeError('Illegal invocation'));
      }

      const file: OpenFile = { name: options.suggestedName, chunks: [], ending: 'open' };

      files.push(file);

      const writable = {
        write: (chunk: string) => {
          if (file.ending !== 'open') {
            return Promise.reject(new TypeError('the file is no longer open'));
          }

          file.chunks.push(chunk);

          return Promise.resolve();
        },
        close: () => updateFileEnding(file, 'closed'),
        abort: () => updateFileEnding(file, 'aborted'),
      };

      return Promise.resolve({
        kind: 'file',
        name: file.name,
        createWritable: () => Promise.resolve(writable),
      });
    },
    readFiles: () =>
      files.map((file) => ({ name: file.name, text: file.chunks.join(''), ending: file.ending })),
  };
}

function updateFileEnding(file: OpenFile, ending: Exclude<FileEnding, 'open'>): Promise<void> {
  if (file.ending !== 'open') {
    return Promise.reject(new TypeError('the file is no longer open'));
  }

  file.ending = ending;

  return Promise.resolve();
}
