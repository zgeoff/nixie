import type { WriteTransaction } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { spendLimitRaisedCodec } from '../record/spend-limit-raised-codec';
import { readSpendProviderRaises } from '../stop/read-spend-provider-raises';
import { readSpendRaise } from '../stop/read-spend-raise';
import { readSpendRouteRaises } from '../stop/read-spend-route-raises';
import type { SpendContext } from '../types';
import { pickEarlierRaise } from './pick-earlier-raise';
import type { RaiseRequest } from './pick-raise-refusal';

export interface WrittenRaise {
  readonly start: string;
  readonly route?: string;
  readonly provider?: string;
  readonly dollars?: number;
  readonly turns?: number;
}

// A raise that the gateway did not answer stands, and the watcher sends it again until the day ends.
// The earlier raise is read in the transaction, so two raises at once leave the larger totals.
export function writeSpendRaiseRecord(
  context: SpendContext,
  request: RaiseRequest & { readonly by: string },
): Promise<WrittenRaise> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const raised = await readRaisedTotals(tx, request);

    await writeRecordsInTransaction(
      tx,
      context.log,
      [raised.route, raised.provider, raised.turns]
        .filter((totals) => totals !== null)
        .map((totals) => ({
          kind: spendLimitRaisedCodec.kind,
          definitions: context.definitions(),
          payload: spendLimitRaisedCodec.encode({ ...totals, by: request.by }),
        })),
    );

    return { start: request.start, ...raised.route, ...raised.provider, ...raised.turns };
  });
}

interface RaisedTotals {
  readonly route: { start: string; route: string; dollars: number } | null;
  readonly provider: { start: string; provider: string; dollars: number } | null;
  readonly turns: { start: string; turns: number } | null;
}

async function readRaisedTotals(
  tx: WriteTransaction,
  request: RaiseRequest,
): Promise<RaisedTotals> {
  const routeRaises = await readSpendRouteRaises(tx, request.start);
  const providerRaises = await readSpendProviderRaises(tx, request.start);
  const earlier = await readSpendRaise(tx, request.start);

  const route =
    request.route === undefined || request.dollars === undefined
      ? null
      : {
          start: request.start,
          route: request.route,
          dollars: Math.max(request.dollars, pickEarlierRaise(routeRaises, request.route)),
        };

  const provider =
    request.provider === undefined || request.dollars === undefined
      ? null
      : {
          start: request.start,
          provider: request.provider,
          dollars: Math.max(request.dollars, pickEarlierRaise(providerRaises, request.provider)),
        };

  const turns =
    request.turns === undefined
      ? null
      : { start: request.start, turns: Math.max(request.turns, earlier?.turns ?? 0) };

  return { route, provider, turns };
}
