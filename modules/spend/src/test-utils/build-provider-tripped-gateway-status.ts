import invariant from 'tiny-invariant';
import type { GatewayStatus } from '../types';
import { buildMockGatewayStatus } from './build-stub-spend-gateway';

// The provider `main` passed its day limit of 100 dollars, and each route of it is under its own.
export function buildProviderTrippedGatewayStatus(): GatewayStatus {
  const status = buildMockGatewayStatus();
  const main = status.providers['main'];

  invariant(main !== undefined, 'the mock status holds the provider main');

  return buildMockGatewayStatus({
    providers: {
      main: {
        ...main,
        day: {
          ...main.day,
          dollars: 101.5,
          tripped: true,
          sinceMs: Date.parse('2026-11-13T08:42:07Z'),
        },
      },
    },
  });
}
