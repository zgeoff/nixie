export interface BrowserSkip {
  readonly isSkipped: boolean;

  // why the browser did not start, which the check prints so a skip never passes in silence
  readonly reason: string | null;
}

export interface BrowserProbe {
  readonly env?: Readonly<Record<string, string | undefined>>;

  // opens one view and closes it, and rejects when the browser cannot start
  readonly openView?: () => Promise<void>;

  readonly print?: (line: string) => void;
}

// Outside CI the browser suites skip when no browser starts, such as under an address-space limit
// or with a TMPDIR too long for Chrome's socket path. In CI, where `CI` is set, the check rethrows
// the start failure, so a broken browser fails the run and the suites never skip there.
export async function checkBrowserSkip(probe: BrowserProbe = {}): Promise<BrowserSkip> {
  const openView = probe.openView ?? openChromeView;

  const failure = await openView().then(
    () => null,
    (error: unknown) => error,
  );

  if (failure === null) {
    return { isSkipped: false, reason: null };
  }

  const env = probe.env ?? process.env;

  if (env['CI'] !== undefined) {
    throw failure;
  }

  const reason = failure instanceof Error ? failure.message : Bun.inspect(failure);
  const print = probe.print ?? console.warn;

  print(`the browser tests skip outside CI: the browser did not start (${reason})`);

  return { isSkipped: true, reason };
}

// The same launch options as the browser suites, because Bun runs one Chrome for the whole test
// process and the first view's options win
async function openChromeView(): Promise<void> {
  // Chrome's sandbox needs user namespaces that a container or a root user lacks
  const view = new Bun.WebView({ backend: { argv: ['--no-sandbox'], type: 'chrome', url: false } });

  try {
    await view.navigate('about:blank');
  } finally {
    view.close();
  }
}
