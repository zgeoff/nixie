// One file the stub picker saved: the text written to it in order, and how its writing ended.
interface StubSavedFile {
  readonly name: string;
  readonly text: string;
  readonly ending: FileEnding;
}

type FileEnding = 'open' | 'closed' | 'aborted';

// what the page passes the picker that the stub reads
interface SavePickerOptions {
  readonly suggestedName: string;
}

export interface StubSaveFilePicker {
  // the browser's showSaveFilePicker, which saves to the name the page suggests, as a user who
  // accepts that name does
  readonly showSaveFilePicker: (options: SavePickerOptions) => Promise<FileSystemFileHandle>;

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

      const handle = {
        kind: 'file',
        name: file.name,
        createWritable: () => Promise.resolve(writable),
      };

      // the page reads only createWritable of the handle and write, close and abort of its writable
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stand-in for a browser type
      return Promise.resolve(handle as unknown as FileSystemFileHandle);
    },
    readFiles: () =>
      files.map((file) => ({ name: file.name, text: file.chunks.join(''), ending: file.ending })),
  };
}

// a file's writing ends once
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the update writes the file's ending
function updateFileEnding(file: OpenFile, ending: Exclude<FileEnding, 'open'>): Promise<void> {
  if (file.ending !== 'open') {
    return Promise.reject(new TypeError('the file is no longer open'));
  }

  file.ending = ending;

  return Promise.resolve();
}
