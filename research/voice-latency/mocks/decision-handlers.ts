import { HttpResponse, http } from 'msw';
import type { DecisionModelName } from '../create-decision-model.ts';
import { decisionStore } from './decision-store.ts';

// Each handler answers in the vendor's response shape, with the usage counts a real call returned.
export const decisionHandlers = [
  http.post(
    'https://api.cloudflare.com/client/v4/accounts/:accountID/ai/run/@cf/cloudflare/clef-flash',
    async ({ request }) => {
      const probability = await recordRequest('clef', request);
      return probability === undefined
        ? HttpResponse.json({ errors: [{ code: 5000, message: 'no answer set' }], success: false }, { status: 500 })
        : HttpResponse.json({
            result: {
              answers: { ended: { noul: probability, type: 'noul' } },
              model: 'clef-flash',
              usage: { input_tokens: 220, output_tokens: 0 },
            },
            success: true,
          });
    },
  ),
  http.post('https://api.typesafe.ai/v1/systemone', async ({ request }) => {
    const probability = await recordRequest('jev', request);
    return probability === undefined
      ? HttpResponse.json({ error: 'no answer set' }, { status: 500 })
      : HttpResponse.json({
          answers: { ended: { noul: probability, type: 'noul' } },
          model: 'jev-1.14.0',
          usage: { input_tokens: 350, output_tokens: 20 },
        });
  }),
];

async function recordRequest(model: DecisionModelName, request: Request): Promise<number | undefined> {
  decisionStore.requests.push({
    authorization: request.headers.get('authorization'),
    body: await request.json(),
    model,
    url: request.url,
  });
  return decisionStore.answers.get(model);
}
