// The push services of Chrome, Firefox, Safari and Edge. The server posts only to these, so a
// visitor to the public URL cannot point it at another host. A leading dot matches any subdomain.
const pushHosts = [
  'fcm.googleapis.com',
  '.push.services.mozilla.com',
  'web.push.apple.com',
  '.notify.windows.com',
];

export function isKnownPushService(endpoint: URL): boolean {
  return (
    endpoint.protocol === 'https:' &&
    pushHosts.some((host) =>
      host.startsWith('.') ? endpoint.hostname.endsWith(host) : endpoint.hostname === host,
    )
  );
}
