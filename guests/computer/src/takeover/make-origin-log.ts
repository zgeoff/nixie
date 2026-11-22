export interface OriginLog {
  // starts a list with the site the browser shows now, or none
  readonly begin: (currentURL: string | null) => void;

  // adds the site of a page the browser shows, while a list is open
  readonly record: (url: string) => void;

  // whether a list is open, which is while a person holds the desktop
  readonly isOpen: () => boolean;

  // the sites in the order shown, and the list closed
  readonly end: () => string[];
}

const maxOrigins = 20;

// The sites that the browser showed while a person held the desktop: scheme and host alone, never a
// path, a query or a fragment, because a reset link can carry its token in the path. A site the same
// as the one before it is listed once.
export function makeOriginLog(): OriginLog {
  const open: { origins: string[] | null } = { origins: null };

  const record = (url: string): void => {
    const origin = toOrigin(url);
    const origins = open.origins;

    if (origins === null || origin === null || origins.at(-1) === origin) {
      return;
    }

    if (origins.length < maxOrigins) {
      origins.push(origin);
    }
  };

  return {
    begin: (currentURL) => {
      open.origins = [];

      if (currentURL !== null) {
        record(currentURL);
      }
    },
    record,
    isOpen: () => open.origins !== null,
    end: () => {
      const origins = open.origins ?? [];

      open.origins = null;

      return origins;
    },
  };
}

// The scheme and host of a web address, or null for a page that is no web page, such as a blank one.
export function toOrigin(url: string): string | null {
  const parsed = URL.parse(url);

  if (parsed === null || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    return null;
  }

  return `${parsed.protocol}//${parsed.hostname}`;
}
