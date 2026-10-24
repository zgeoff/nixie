import { HttpResponse, http } from 'msw';
import { datasetStore } from './dataset-store.ts';

// The rows endpoint returns the page of a dataset's rows that offset and length select, each
// wrapped as the server wraps it. Recordings sit under the reserved .test domain.
export const datasetHandlers = [
  http.get('https://datasets-server.huggingface.co/rows', ({ request }) => {
    const query = new URL(request.url).searchParams;
    const offset = Number(query.get('offset'));
    const rows = datasetStore.rows.get(query.get('dataset') ?? '') ?? [];
    return HttpResponse.json({
      rows: rows.slice(offset, offset + Number(query.get('length'))).map((row) => ({ row })),
    });
  }),
  http.get('https://audio.test/:file', ({ request }) => {
    const recording = datasetStore.audio.get(request.url);
    return recording === undefined ? new HttpResponse(null, { status: 404 }) : HttpResponse.arrayBuffer(recording.slice().buffer);
  }),
];
