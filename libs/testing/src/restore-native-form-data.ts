import { File } from 'node:buffer';

// The happy-dom preload replaces File and FormData but keeps Bun's fetch, and Bun's fetch cannot
// send happy-dom's FormData as a multipart body, so this preload puts Bun's own classes back.
const emptyForm = new Response('', {
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
});

// oxlint-disable-next-line typescript/no-deprecated -- it parses an empty form only to reach Bun's FormData
const form = await emptyForm.formData();

Object.assign(globalThis, { File, FormData: form.constructor });
