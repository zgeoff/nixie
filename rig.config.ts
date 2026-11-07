import { defineRig } from '@zgeoff/rig';

// The project-testing skill names the real system each lane runs. Each restic and bundle test reads
// a build that its lane's start hook makes first, because a build outlasts a test's limit.
export default defineRig({
  lanes: {
    browser: { memory: '8G' },

    // an imp suite needs its package's bunfig, which leaves out the web preload, and rig reads only
    // the root bunfig, so each package's test:imp script runs bun test in the package
    imp: { limit: '14s' },
    restic: { limit: '40s', start: 'scripts/test-utils/prepare-restic-lane.ts' },
    bundle: { limit: '15s', start: 'scripts/test-utils/prepare-bundle-lane.ts' },
  },
});
