import { loadGoogleScript } from './load-google-script';
import { readGoogleMember } from './read-google-member';

export interface PickerOpening {
  // the access token of the browser's own, which holds `drive.file` alone
  readonly token: string;
  readonly pickerKey: string;
  readonly projectNumber: string;
}

const apiSource = 'https://apis.google.com/js/api.js';

// Opens Google Picker with the browser's own token, and answers the Drive IDs of the files that
// the owner picked. Closing the picker answers none.
export async function openGooglePicker(opening: PickerOpening): Promise<string[]> {
  await loadGoogleScript(apiSource, () => Reflect.get(globalThis, 'gapi') !== undefined);

  if (readPicker() === undefined) {
    await loadPickerLibrary();
  }

  const picker = readPicker();
  const actions = readGoogleMember(picker, 'Action');

  return new Promise((resolve) => {
    const onPick = (data: unknown) => {
      const action = readGoogleMember(data, 'action');

      if (action === readGoogleMember(actions, 'PICKED')) {
        resolve(readPickedIDs(readGoogleMember(data, 'docs')));
      } else if (action === readGoogleMember(actions, 'CANCEL')) {
        resolve([]);
      }
    };

    let builder = build(readGoogleMember(picker, 'PickerBuilder'), []);

    builder = call(builder, 'addView', [build(readGoogleMember(picker, 'DocsView'), [])]);
    builder = call(builder, 'setOAuthToken', [opening.token]);
    builder = call(builder, 'setDeveloperKey', [opening.pickerKey]);
    builder = call(builder, 'setAppId', [opening.projectNumber]);
    builder = call(builder, 'setCallback', [onPick]);

    call(call(builder, 'build', []), 'setVisible', [true]);
  });
}

function readPicker(): unknown {
  return readGoogleMember(Reflect.get(globalThis, 'google'), 'picker');
}

function loadPickerLibrary(): Promise<void> {
  return new Promise((resolve, reject) => {
    const load = readGoogleMember(Reflect.get(globalThis, 'gapi'), 'load');

    if (typeof load !== 'function') {
      reject(new TypeError('Google did not load.'));

      return;
    }

    Reflect.apply(load, undefined, ['picker', { callback: resolve }]);
  });
}

function readPickedIDs(docs: unknown): string[] {
  if (!Array.isArray(docs)) {
    return [];
  }

  return docs.flatMap((doc: unknown) => {
    const id = readGoogleMember(doc, 'id');

    return typeof id === 'string' ? [id] : [];
  });
}

function build(constructor: unknown, args: readonly unknown[]): unknown {
  if (typeof constructor !== 'function') {
    throw new TypeError('Google Picker did not load.');
  }

  return Reflect.construct(constructor, [...args]);
}

function call(target: unknown, name: string, args: readonly unknown[]): unknown {
  const method = readGoogleMember(target, name);

  if (typeof method !== 'function') {
    throw new TypeError('Google Picker did not load.');
  }

  return Reflect.apply(method, target, [...args]);
}
