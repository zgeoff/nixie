import { atob, btoa } from 'node:buffer';

// The happy-dom preload replaces atob and btoa with script versions, and zod's base64 check calls
// atob on each image a frame carries, so a 10 MiB image takes seconds instead of milliseconds.
Object.assign(globalThis, { atob, btoa });
