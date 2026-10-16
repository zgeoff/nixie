// Preloaded by bunfig.toml: rewrites the conversation guest's turn module to import the Agent SDK
// from override-query.ts, so the production turn runs unchanged except for the cache lifetime option
// that the run under test adds to its query. Bun's runtime plugins skip onResolve for a bare package
// import, so the plugin rewrites the module's source on load instead.
import { join } from 'node:path';

const overridePath = join(import.meta.dir, 'override-query.ts');

Bun.plugin({
  name: 'cache-lifetime-query-override',
  setup: (build) => {
    build.onLoad({ filter: /guests\/conversation\/src\/run-turn\.ts$/ }, async (args) => ({
      loader: 'ts',
      contents: (await Bun.file(args.path).text()).replace(
        "import { query } from '@anthropic-ai/claude-agent-sdk';",
        `import { query } from ${JSON.stringify(overridePath)};`,
      ),
    }));
  },
});
