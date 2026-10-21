// Bun applies its idle timeout to a server on a Unix socket too, but bun-types declares the option
// only for a server on a host and port
declare module 'bun' {
  namespace Serve {
    interface UnixServeOptions<WebSocketData> {
      idleTimeout?: number;
    }
  }
}
