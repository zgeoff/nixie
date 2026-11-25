// What a ticket opens: a page's frame, or one image the page declares.
export type PageTicket =
  | {
      readonly kind: 'frame';
      readonly deviceID: string;
      readonly region: string;
      readonly shown: string;
    }
  | {
      readonly kind: 'image';
      readonly deviceID: string;
      readonly region: string;
      readonly shown: string;
      readonly image: string;
    };

export interface IssuedTickets {
  readonly frame: string;
  readonly images: readonly { readonly image: string; readonly ticket: string }[];
}

export interface PageTickets {
  // The tickets of the content a region shows. The same content gets the same tickets each time,
  // so a stream that sends its layout again leaves the frame as it is, and content that replaces it
  // drops the tickets of the one before.
  readonly issue: (
    deviceID: string,
    region: string,
    shown: string,
    images: readonly string[],
  ) => IssuedTickets;

  // what the ticket opens, or null for a ticket that nobody issued or that new content replaced
  readonly read: (ticket: string) => PageTicket | null;
}

interface HeldRegion {
  readonly shown: string;
  readonly frame: string;
  readonly images: Map<string, string>;
}

// The tickets that the device's frames and images load by, in memory only: a restart drops them,
// and each device opens its stream again and gets new ones. Each ticket comes from
// `crypto.randomUUID()`, so the ticket is the whole check of a request that carries no session.
export function createPageTickets(): PageTickets {
  const regions = new Map<string, HeldRegion>();
  const tickets = new Map<string, PageTicket>();

  const drop = (held: HeldRegion): void => {
    tickets.delete(held.frame);

    for (const ticket of held.images.values()) {
      tickets.delete(ticket);
    }
  };

  return {
    issue: (deviceID, region, shown, images) => {
      const key = `${deviceID}\u0000${region}`;
      const earlier = regions.get(key);

      if (earlier !== undefined && earlier.shown !== shown) {
        drop(earlier);
      }

      const held: HeldRegion =
        earlier !== undefined && earlier.shown === shown
          ? earlier
          : { shown, frame: crypto.randomUUID(), images: new Map() };

      regions.set(key, held);
      tickets.set(held.frame, { kind: 'frame', deviceID, region, shown });

      for (const image of images) {
        if (!held.images.has(image)) {
          const ticket = crypto.randomUUID();

          held.images.set(image, ticket);
          tickets.set(ticket, { kind: 'image', deviceID, region, shown, image });
        }
      }

      return {
        frame: held.frame,
        images: images.map((image) => ({ image, ticket: held.images.get(image) ?? '' })),
      };
    },
    read: (ticket) => tickets.get(ticket) ?? null,
  };
}
