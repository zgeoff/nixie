import { createBrowserView } from './create-browser-view';

export interface BrowserSkip {
  readonly isSkipped: boolean;

  readonly reason: string | null;
}

export interface BrowserProbe {
  readonly env?: Readonly<Record<string, string | undefined>>;

  readonly openView?: () => Promise<void>;

  readonly print?: (line: string) => void;
}

// Chrome fails to start under an address-space limit, or with a TMPDIR too long for its socket
// path.
export async function checkBrowserSkip(probe: BrowserProbe = {}): Promise<BrowserSkip> {
  const openView = probe.openView ?? openChromeView;

  const failure = await openView().then(
    () => null,
    (error: unknown) => error,
  );

  if (failure === null) {
    return { isSkipped: false, reason: null };
  }

  const error =
    failure instanceof Error ? failure : new Error(Bun.inspect(failure), { cause: failure });

  const env = probe.env ?? process.env;

  if (env['CI'] !== undefined) {
    throw error;
  }

  const reason = error.message;
  const print = probe.print ?? console.warn;

  print(`the browser tests skip outside CI: the browser did not start (${reason})`);

  return { isSkipped: true, reason };
}

async function openChromeView(): Promise<void> {
  const view = createBrowserView();

  try {
    await view.navigate('about:blank');
  } finally {
    view.close();
  }
}
