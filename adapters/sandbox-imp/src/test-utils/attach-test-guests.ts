import type { TestGuest, TestImpd } from '@impz/testing';
import invariant from 'tiny-invariant';
import type { ImpPort } from '../types';

export interface GuestedImpPort {
  readonly port: ImpPort;

  readonly getGuest: (impName: string) => TestGuest;
}

// The adapter opens an imp's tool route before its create returns, and impd fails a route to an imp
// whose stand-in guest is not up, so each create starts the guest before it returns.
export function attachTestGuests(
  impd: Pick<TestImpd, 'startGuest'>,
  port: ImpPort,
): GuestedImpPort {
  const guests = new Map<string, TestGuest>();

  return {
    port: {
      ...port,
      createImp: async (input) => {
        await port.createImp(input);

        const guest = await impd.startGuest(input.name);

        guests.set(input.name, guest);
      },
    },
    getGuest: (impName) => {
      const guest = guests.get(impName);

      invariant(guest, `no imp named ${impName} was created through this port`);

      return guest;
    },
  };
}
