// The private URL of nixie's API, which only the Start server calls. The browser never learns it:
// it calls /rpc on its own origin.
export function requireAPIURL(): string {
  const apiURL = process.env['NIXIE_API_URL'];

  if (apiURL === undefined || apiURL === '') {
    throw new Error('NIXIE_API_URL must name the private URL of nixie’s API');
  }

  return apiURL.replace(/\/+$/u, '');
}
