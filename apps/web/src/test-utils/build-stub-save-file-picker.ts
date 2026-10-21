type FileEnding = 'open' | 'closed' | 'aborted';

// One file the stub picker saved: the text written to it in order, and how its writing ended.
interface StubSavedFile {
  readonly name: string;
  readonly text: string;
  readonly ending: FileEnding;
}

// what the page passes the picker that the stub reads
interface SavePickerOptions {
  readonly suggestedName: string;
}

// the parts of a file handle and its writable that the page reads
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
  // the browser's showSaveFilePicker, which saves to the name the page suggests, as a user who
  // accepts that name does
  readonly showSaveFilePicker: (options: SavePickerOptions) => Promise<StubFileHandle>;

  // each file the picker opened, in the order it opened them
  readonly readFiles: () => readonly StubSavedFile[];
}

interface OpenFile {
  readonly name: string;
  readonly chunks: string[];
  ending: FileEnding;
}

// Stands in for the File System Access API's save picker, which happy-dom lacks, called on the
// window as the browser's is. Each file's writable takes string chunks and ends once, by close or
// by abort.
export function buildStubSaveFilePicker(): StubSaveFilePicker {
  const files: OpenFile[] = [];

  return {
    showSaveFilePicker(this: unknown, options) {
      // the browser's picker is a method of the window, and refuses a call with no window as this
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

// a file's writing ends once
function updateFileEnding(file: OpenFile, ending: Exclude<FileEnding, 'open'>): Promise<void> {
  if (file.ending !== 'open') {
    return Promise.reject(new TypeError('the file is no longer open'));
  }

  file.ending = ending;

  return Promise.resolve();
}
