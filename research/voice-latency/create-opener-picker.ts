// Clef-flash picks the spoken opening of a reply from a fixed set, while the answer model writes the
// rest. Decision 0040 lets an acknowledgement claim no outcome and make no promise, so every phrase
// here only shows the request was heard.
import { z } from 'zod';

export const openerName = z.enum(['check', 'okay', 'question', 'see', 'sure']);

export type OpenerName = z.infer<typeof openerName>;

export const openers = {
  check: {
    phrase: 'Let me check.',
    use: 'The person asks about something that needs looking up, such as the weather, a calendar or a timer.',
  },
  okay: { phrase: 'Okay.', use: 'The person gives an instruction or asks for a quick suggestion.' },
  question: { phrase: 'Good question.', use: 'The person asks why or how something works.' },
  see: { phrase: 'Hmm, let me see.', use: 'The person asks for advice that takes some thought.' },
  sure: { phrase: 'Sure.', use: 'The person asks for something simple, such as a fact or an idea.' },
} satisfies Record<OpenerName, { phrase: string; use: string }>;

const answerSchema = z.object({
  result: z.object({
    answers: z.object({
      opener: z.object({
        choice: openerName,
        confidence: z.number(),
        type: z.literal('choice'),
      }),
    }),
    model: z.string(),
  }),
  success: z.literal(true),
});

export function createOpenerPicker(connection: {
  accountID: string;
  token: string;
  transport: typeof fetch;
}): { pickOpener: (transcript: string) => Promise<{ confidence: number; opener: OpenerName }> } {
  const url = `https://api.cloudflare.com/client/v4/accounts/${connection.accountID}/ai/run/@cf/cloudflare/clef-flash`;
  return {
    pickOpener: async (transcript) => {
      const response = await connection.transport(url, {
        body: JSON.stringify({
          model: 'clef-flash',
          questions: {
            opener: {
              criteria: Object.fromEntries(
                Object.entries(openers).map(([name, opener]) => [name, `"${opener.phrase}" ${opener.use}`]),
              ),
              instructions: 'Which spoken opening fits best before the assistant answers this?',
              type: 'choice',
            },
          },
          state: `A person said to a voice assistant: "${transcript}"`,
        }),
        // A broker that holds the key adds the header itself, so an empty token sends none.
        headers: {
          'content-type': 'application/json',
          ...(connection.token === '' ? {} : { authorization: `Bearer ${connection.token}` }),
        },
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`clef: HTTP ${response.status} ${await response.text()}`);
      }
      const answer = answerSchema.parse(await response.json()).result.answers.opener;
      return { confidence: answer.confidence, opener: answer.choice };
    },
  };
}
