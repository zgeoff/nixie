import { runRenderGuest } from './render/run-render-guest';

await runRenderGuest({
  input: Bun.stdin.stream(),
  write: async (bytes) => {
    await Bun.write(Bun.stdout, bytes);
  },
});
