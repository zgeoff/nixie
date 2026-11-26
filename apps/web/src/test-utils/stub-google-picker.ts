import { onTestFinished } from 'bun:test';

export interface StubbedGooglePicker {
  // the config of each token request that the page made
  readonly tokenRequests: Record<string, unknown>[];

  // the token, developer key and app ID of each picker that the page opened
  readonly openings: { token: string; key: string; appID: string }[];
}

interface StubAnswers {
  // the scope that the token request answers with
  readonly scope: string;

  // the Drive IDs that the picker answers with
  readonly picked: readonly string[];
}

// Puts a stand-in for Google's sign-in and Picker scripts on the page, which answer as asked. The
// page finds both loaded, so it adds no script. Registers its own removal for the end of the test.
export function stubGooglePicker(answers: StubAnswers): StubbedGooglePicker {
  const stubbed: StubbedGooglePicker = { tokenRequests: [], openings: [] };

  Reflect.set(globalThis, 'google', {
    accounts: {
      oauth2: {
        initTokenClient: (config: Record<string, unknown>) => {
          stubbed.tokenRequests.push(config);

          return {
            requestAccessToken: () => {
              const onAnswer = config['callback'];

              if (typeof onAnswer === 'function') {
                Reflect.apply(onAnswer, undefined, [
                  { access_token: 'browser-token', scope: answers.scope },
                ]);
              }
            },
          };
        },
      },
    },
    picker: {
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
      DocsView: buildDocsView,
      PickerBuilder: buildPickerBuilder.bind(undefined, stubbed, answers),
    },
  });

  Reflect.set(globalThis, 'gapi', {});

  onTestFinished(() => {
    Reflect.deleteProperty(globalThis, 'google');
    Reflect.deleteProperty(globalThis, 'gapi');
  });

  return stubbed;
}

// Google's script builds the picker with `new`, so each is a plain function that returns the object
// that `new` gives back.
function buildDocsView() {
  return {};
}

function buildPickerBuilder(stubbed: StubbedGooglePicker, answers: StubAnswers) {
  const state: { token: string; key: string; appID: string; onPick: (data: unknown) => void } = {
    token: '',
    key: '',
    appID: '',
    onPick: () => {},
  };

  const builder = {
    addView: () => builder,
    setOAuthToken: (token: string) => {
      state.token = token;

      return builder;
    },
    setDeveloperKey: (key: string) => {
      state.key = key;

      return builder;
    },
    setAppId: (appID: string) => {
      state.appID = appID;

      return builder;
    },
    setCallback: (onPick: (data: unknown) => void) => {
      state.onPick = onPick;

      return builder;
    },
    build: () => ({
      setVisible: () => {
        stubbed.openings.push({ token: state.token, key: state.key, appID: state.appID });
        state.onPick({ action: 'picked', docs: answers.picked.map((id) => ({ id })) });
      },
    }),
  };

  return builder;
}
