import { File } from 'node:buffer';

// The happy-dom preload keeps Bun's own fetch stack but replaces File and FormData, and Bun's fetch
// cannot send happy-dom's as a multipart body. This preload runs after it and puts Bun's own back,
// so a test sends a file as a browser or a server process does.
const emptyForm = new Response('', {
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
});

// oxlint-disable-next-line typescript/no-deprecated -- it parses an empty form only to reach Bun's FormData
const form = await emptyForm.formData();

// the preload kept Bun's Response, so the form it parses is a native FormData
Object.assign(globalThis, { File, FormData: form.constructor });
