import type { LiveRecord } from './use-live-records';

export interface MessageRoute {
  readonly taskID: string;
  readonly isMove: boolean;
}

export function collectMessageRoutes(
  records: readonly LiveRecord[],
): ReadonlyMap<number, MessageRoute> {
  const routed = records
    .flatMap((record) =>
      record.route === undefined ? [] : [{ ...record.route, at: record.sequence }],
    )
    .toSorted((left, right) => left.at - right.at);

  return new Map(
    routed.flatMap((route) =>
      route.messages.map(
        (message) => [message, { taskID: route.taskID, isMove: route.isMove }] as const,
      ),
    ),
  );
}
