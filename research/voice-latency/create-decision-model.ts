// Cloudflare's Clef-flash and TypeSafe's Jev take the same request: a state, and named questions
// that each come back as a typed answer. Both read the live transcript here and answer one yes/no
// question, whose probability sets how long the turn waits.
import { z } from 'zod';

export type DecisionModelName = 'clef' | 'jev';

const answerSchema = z.object({
  answers: z.object({ ended: z.object({ noul: z.number().min(0).max(1), type: z.literal('noul') }) }),
  model: z.string(),
});
const clefSchema = z.object({ result: answerSchema, success: z.literal(true) });

export function createDecisionModel(
  name: DecisionModelName,
  connection: { accountID?: string; token: string },
): { readEndProbability: (transcript: string) => Promise<{ model: string; probability: number }> } {
  const request =
    name === 'clef'
      ? {
          model: 'clef-flash',
          url: `https://api.cloudflare.com/client/v4/accounts/${connection.accountID}/ai/run/@cf/cloudflare/clef-flash`,
        }
      : { model: 'jev-latest', url: 'https://api.typesafe.ai/v1/systemone' };
  return {
    readEndProbability: async (transcript) => {
      const response = await fetch(request.url, {
        body: JSON.stringify(buildTurnEndRequest(request.model, transcript)),
        // A broker that holds the key adds the header itself, so an empty token sends none.
        headers: {
          'content-type': 'application/json',
          ...(connection.token === '' ? {} : { authorization: `Bearer ${connection.token}` }),
        },
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`${name}: HTTP ${response.status} ${await response.text()}`);
      }
      const body: unknown = await response.json();
      const parsed = name === 'clef' ? clefSchema.parse(body).result : answerSchema.parse(body);
      return { model: parsed.model, probability: parsed.answers.ended.noul };
    },
  };
}

function buildTurnEndRequest(
  model: string,
  transcript: string,
): { model: string; questions: Record<string, unknown>; state: string } {
  return {
    model,
    questions: {
      ended: {
        instructions:
          'Has the person finished what they want to say, so the assistant should reply now? A sentence cut off mid-way, a trailing filler word such as "um" or "and", or a list still going means they have not finished.',
        type: 'noul',
      },
    },
    state: `A person is speaking to a voice assistant, and has just paused. The live speech-to-text transcript so far, lowercase and without punctuation: "${transcript}"`,
  };
}
