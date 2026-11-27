import type { Clock } from '@heynixie/clock';
import type { ConnectionContext, ConnectionState, ConnectorAction } from '@heynixie/connections';
import { googleHosts } from '@heynixie/connector-google';
import type { GoogleHosts, PickedFile } from '@heynixie/google';
import {
  buildGoogleActions,
  collectGmailConnections,
  isGmailPolled,
  readPickedFiles,
} from '@heynixie/google';
import type { Definitions, Log, WriteTransaction } from '@heynixie/log';
import type { FetchReply } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { buildGoogleToolkit } from '../google/build-google-toolkit';
import { buildTestGoogleHosts } from '../test/build-test-google-hosts';
import { readMailHTML } from './read-mail-html';
import type { ServerInputs } from './server-inputs';

type HTMLReader = (html: string) => Promise<FetchReply>;

type LiveReader = (connection?: string) => Promise<readonly ConnectionContext[]>;

interface GoogleRuntime {
  readonly readLiveContexts: LiveReader;
  readonly readStates: () => Promise<readonly ConnectionState[]>;
  readonly probeLive: (tx: WriteTransaction, connectionID: string) => Promise<boolean>;
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
}

export interface GoogleToolsPart {
  readonly hosts: GoogleHosts;

  // the Google connector's tools, which the tool list and the action queue need before the
  // connections and the fetch sandbox have started
  readonly actions: readonly ConnectorAction[];

  // reads each file that the owner picked in Drive's picker with the connection's own token; null
  // when the connection is not live
  readonly readPickedFiles: (
    connection: string,
    files: readonly string[],
  ) => Promise<readonly PickedFile[] | null>;

  // the live connections, the log and the clock, once they run; a tool finds no connection before
  // that
  readonly bindRuntime: (runtime: GoogleRuntime) => void;

  // the fetch sandbox's HTML reader, once it runs; a mail's HTML reads as unsupported before that
  readonly bindHTMLReader: (read: HTMLReader) => void;
}

// Builds the Gmail tools on late-bound ports, so the tool list and the queue hold them while the
// connections and the fetch sandbox start on their own schedule.
export function startGoogleToolsPart(inputs: ServerInputs): GoogleToolsPart {
  const googleURL = inputs.options.harness?.googleURL ?? null;

  const hosts =
    !NIXIE_TEST_BUILD || googleURL === null ? googleHosts : buildTestGoogleHosts(googleURL);

  const bound: { runtime: GoogleRuntime | null; readHTML: HTMLReader | null } = {
    runtime: null,
    readHTML: null,
  };

  const readRuntime = (): GoogleRuntime => {
    invariant(bound.runtime !== null, 'a Gmail tool ran before the connections started');

    return bound.runtime;
  };

  const webFetch = inputs.options.config.web_fetch;
  const google = inputs.options.config.google;

  invariant(google !== undefined, 'the google tools start only with a google section');

  const actions = buildGoogleActions({
    toolkit: buildGoogleToolkit(),
    hosts,
    access: {
      readLiveContexts: (connection) => {
        const runtime = bound.runtime;

        return runtime === null ? Promise.resolve([]) : runtime.readLiveContexts(connection);
      },
      readPolledConnections: async () => {
        const runtime = bound.runtime;
        const states = runtime === null ? [] : await runtime.readStates();

        return collectGmailConnections(states)
          .filter((connection) => isGmailPolled(connection))
          .map((connection) => connection.connection);
      },
      probeLive: (tx, connectionID) => readRuntime().probeLive(tx, connectionID),
    },
    log: {
      get deploymentKey() {
        return readRuntime().log.deploymentKey;
      },
      get writer() {
        return readRuntime().log.writer;
      },
    },
    clock: { now: () => readRuntime().clock.now() },
    wake: {
      context: () => {
        const runtime = readRuntime();

        return { log: runtime.log, clock: runtime.clock, definitions: runtime.definitions };
      },
      defaultWindowMs: inputs.options.config.wake_rules.window,
      replyExpiryMs: inputs.options.config.wake_rules.reply_expiry,
    },
    readHTML: (html) => readMailHTML(bound.readHTML, html),
    textBytes: webFetch.limits.textBytes,
    linkPathChars: webFetch.linkPathChars,
    imageLongEdge: webFetch.imageLongEdge,
  });

  return {
    hosts,
    actions,
    readPickedFiles: (connection, files) =>
      readPickedFiles(
        {
          hosts,
          access: {
            readLiveContexts: (name) => {
              const runtime = bound.runtime;

              return runtime === null ? Promise.resolve([]) : runtime.readLiveContexts(name);
            },
          },
        },
        connection,
        files,
      ),
    bindRuntime: (runtime) => {
      bound.runtime = runtime;
    },
    bindHTMLReader: (read) => {
      bound.readHTML = read;
    },
  };
}
