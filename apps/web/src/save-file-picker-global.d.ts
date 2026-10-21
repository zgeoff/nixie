// Only some browsers have the File System Access API's save picker, so the DOM types leave it out.
declare var showSaveFilePicker: ShowSaveFilePicker | undefined;

type ShowSaveFilePicker = (options: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;

interface SaveFilePickerOptions {
  readonly suggestedName: string;
  readonly types: readonly {
    readonly description: string;
    readonly accept: Readonly<Record<string, readonly string[]>>;
  }[];
}
