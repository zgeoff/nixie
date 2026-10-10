// Runs the API stand-in as its own process, and prints a session token for each device name given.
import { createSession, startApi } from './api.ts';

const api = startApi({
    port: Number(process.env.PORT ?? 3200),
    webOrigin: process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3100',
  }),
  devices = (process.env.DEVICES ?? 'laptop').split(','),
  tokens = Object.fromEntries(devices.map((device) => [device, createSession(device)]));
console.log(JSON.stringify(tokens));

process.on('SIGTERM', () => {
  void api.stop();
  process.exit(0);
});
