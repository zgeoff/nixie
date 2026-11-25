import { createHeldTestStore } from '@heynixie/credentials/test-utils';
import type { HeldTestStore } from '@heynixie/credentials/test-utils';
import invariant from 'tiny-invariant';
import { readServerRows } from '../rows/read-server-rows';
import type { FinishResult } from '../signin/create-sign-in';
import { startMcp } from '../start-mcp';
import type { Mcp } from '../start-mcp';
import type { ServerFacts } from '../types';
import { buildServerFacts } from './build-server-facts';
import { startStandInMcpSite } from './start-stand-in-mcp-site';
import type { StandInMcpSite, StandInTool } from './start-stand-in-mcp-site';
import { startTestMcp } from './start-test-mcp';
import type { TestMcp } from './start-test-mcp';

export const standInNixieOrigin = 'https://nixie.example.org';

export interface StandInMcpOptions {
  readonly tools?: readonly StandInTool[];
  readonly facts?: Partial<ServerFacts>;
  readonly listingTimeoutSeconds?: number;
}

export interface StandInMcp {
  readonly site: StandInMcpSite;
  readonly test: TestMcp;
  readonly held: HeldTestStore;

  // the proxy over the real store, started with the server `tracker` in its config
  readonly mcp: Mcp;

  // Starts another proxy over the same log and store, as a restart does: it holds nothing in memory.
  readonly restart: (changed?: Partial<ServerFacts>) => Mcp;

  // approves the server's proposal, so the server joins as added
  readonly approveServer: () => Promise<void>;

  // Presses Connect, signs in on the stand-in's page, and lets the return finish the sign-in.
  // `iss` replaces the issuer the return carries.
  readonly signIn: (mcp: Mcp, iss?: string | null) => Promise<FinishResult>;
}

// A proxy over the real credential store, with every request going to a stand-in MCP site on
// loopback. The site's host resolves to the loopback address, which only the config's private range
// lets through, as it does for a server on a private network.
export async function startStandInMcp(options: StandInMcpOptions = {}): Promise<StandInMcp> {
  const siteOptions = options.tools === undefined ? {} : { tools: options.tools };

  const site = await startStandInMcpSite(siteOptions);

  const holder: { mcp: Mcp | null } = { mcp: null };

  const test = await startTestMcp({
    readHandler: () => {
      invariant(holder.mcp, 'the proxy starts before the first answer');

      return holder.mcp.makeProposalHandler();
    },
  });

  const held = await createHeldTestStore({
    log: test.log,
    ca: site.ca,
    now: () => test.clock.now(),
    checkAddress: () => false,
  });

  const facts = buildServerFacts({
    url: site.mcpURL,
    clientID: site.clientID,
    scope: 'read write',
    privateRange: '127.0.0.0/8',
    ...options.facts,
  });

  const makeMcp = (changed: Partial<ServerFacts> = {}): Mcp =>
    startMcp({
      log: test.log,
      definitions: test.context.definitions,
      now: test.context.now,
      store: held.store,
      backend: held.backend,
      servers: { tracker: { ...facts, ...changed } },
      listingTimeoutSeconds: options.listingTimeoutSeconds ?? 5,
      takenModelNames: () => new Set(),
    });

  const mcp = makeMcp();

  holder.mcp = mcp;

  await mcp.start();

  const fetchPage = held.store.fetcher(null, [site.origin], {
    redirects: 'none',
    pairing: { host: site.host, range: '127.0.0.0/8' },
  });

  return {
    site,
    test,
    held,
    mcp,
    restart: (changed) => {
      const restarted = makeMcp(changed);

      holder.mcp = restarted;

      return restarted;
    },
    approveServer: async () => {
      const rows = await readServerRows(test.log.writer.db);

      const proposalID = rows.find((row) => row.server_id === 'tracker')?.proposal_id ?? null;

      invariant(proposalID, 'the start proposed the server');

      await test.answer(proposalID, 'approve');
    },
    signIn: async (signingIn, iss) => {
      const connected = await signingIn.connect('tracker', standInNixieOrigin);

      invariant(connected.status === 'ok', 'Connect gives the authorize URL');

      const authorized = await fetchPage(connected.authorizeURL);

      const back = new URL(authorized.headers.get('location') ?? '');

      return signingIn.finishSignIn({
        state: back.searchParams.get('state') ?? '',
        code: back.searchParams.get('code'),
        error: null,
        iss: iss === undefined ? back.searchParams.get('iss') : iss,
      });
    },
  };
}
