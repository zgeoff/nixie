import { rename } from 'node:fs/promises';
import { define } from 'gunshi';
import { buildPreviewRouteConfig } from './build-preview-route-config';

export const previewRouteCommand = define({
  name: 'run-preview-route-config',
  description: "Writes a copy of a preview config with a host's model route on each base URL",
  args: {
    route: { type: 'string', required: true, description: "the host's model route" },
    source: { type: 'string', required: true, description: 'the preview config' },
    target: { type: 'string', required: true, description: 'the copy to write' },
  },
  run: async (ctx) => {
    const text = await Bun.file(ctx.values.source).text();

    const result = buildPreviewRouteConfig(ctx.values.route, text);

    if (!result.ok) {
      throw new Error(result.error);
    }

    // the preview's health check reruns its entrypoint every few seconds, so the copy lands whole
    const part = `${ctx.values.target}.${String(process.pid)}`;

    await Bun.write(part, result.config);

    await rename(part, ctx.values.target);
  },
});
