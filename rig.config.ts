import { defineRig } from '@zgeoff/rig';

// The project-testing skill names the real system each lane runs. Each restic, bundle and Agent SDK
// test reads a build that its lane's start hook makes first, because a build outlasts a test's limit.
export default defineRig({
  // spikes run by hand, and CI only typechecks them
  ignore: ['docs/design/**', 'research/**'],
  lanes: {
    browser: { memory: '8G' },
    imp: { limit: '14s' },

    // the shell guest's commands run in their own user namespace, which needs a runner that allows it
    userns: { limit: '5s' },
    e2e: { start: 'scripts/test-utils/prepare-e2e-lane.ts' },
    restic: { limit: '40s', start: 'scripts/test-utils/prepare-restic-lane.ts' },
    'agent-sdk': { start: 'scripts/test-utils/prepare-agent-sdk-lane.ts' },
    bundle: { limit: '15s', start: 'scripts/test-utils/prepare-bundle-lane.ts' },
  },

  // Each app with an `e2e/` folder declares the program its tests start. `rig e2e` builds each one
  // before the tests, and `resolveProgram(name)` gives the test the command that runs the build.
  programs: {
    // the server's test bundle, with its fault points and harness clock switched on
    nixie: {
      package: 'apps/server',
      source: 'src/main.ts',
      build: 'bun src/test-utils/write-test-program.ts',
      artifact: 'dist/test-bundle/main.js',
    },
    web: {
      package: 'apps/web',
      source: 'src/server.ts',

      // Node's wasm trap handler reserves more address space than a `ulimit -v` cap allows, and
      // Vite loads wasm.
      build: 'NODE_OPTIONS="$NODE_OPTIONS --disable-wasm-trap-handler" bun run build',
      artifact: 'dist/server/server.js',
    },
    'backup-job': {
      package: 'apps/backup-job',
      source: 'src/main.ts',
      build: 'bun run build',
      artifact: 'dist/main.js',
    },
  },
});
