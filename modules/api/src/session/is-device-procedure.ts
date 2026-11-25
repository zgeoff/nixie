// The only calls a device session may make: it follows its own device stream, sends its screen's
// size and the errors and events of its regions, switches its own screen, reads an image it shows, and signs out. Every other path stays closed to it, so a call
// that a later release adds is refused until it is listed here.
const deviceProcedurePaths: ReadonlySet<string> = new Set([
  '/rpc/live/follow',
  '/rpc/devices/resize',
  '/rpc/devices/pageError',
  '/rpc/devices/pageEvent',
  '/rpc/devices/setCapability',
  '/rpc/devices/readImage',
  '/rpc/sessions/signOut',
]);

export function isDeviceProcedure(pathname: string): boolean {
  return deviceProcedurePaths.has(pathname);
}
