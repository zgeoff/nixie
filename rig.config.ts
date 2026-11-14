import { defineRig } from '@zgeoff/rig';

// The project-testing skill names the real system each lane runs. Each restic, bundle and Agent SDK
// test reads a build that its lane's start hook makes first, because a build outlasts a test's limit.
export default defineRig({
  // spikes run by hand, and CI only typechecks them
  ignore: ['docs/design/**', 'research/**'],
  lanes: {
    browser: { memory: '8G' },
    imp: { limit: '14s' },
    restic: { limit: '40s', start: 'scripts/test-utils/prepare-restic-lane.ts' },
    'agent-sdk': { start: 'scripts/test-utils/prepare-agent-sdk-lane.ts' },
    bundle: { limit: '15s', start: 'scripts/test-utils/prepare-bundle-lane.ts' },
  },
});
