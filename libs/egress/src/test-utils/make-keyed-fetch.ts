// Stands in for the credential store's fetcher in an adapter's test: it adds one credential header,
// as the store does on the host, and sends the request over the global fetch, where a mock network
// answers it.
export function makeKeyedFetch(
  header: string,
  value: string,
): (input: string, init?: RequestInit) => Promise<Response> {
  return (input, init) => {
    const headers = new Headers(init?.headers);

    headers.set(header, value);

    return fetch(input, { ...init, headers });
  };
}
