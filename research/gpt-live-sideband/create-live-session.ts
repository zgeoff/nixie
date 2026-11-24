// Creates a GPT-Live session from a device's offer with the server's key, as nixie's server would.
import { z } from 'zod';

export type CreatedSession =
  | { kind: 'created'; sdpAnswer: string; sessionID: string }
  | { body: string; kind: 'refused'; status: number };

const createdBody = z.object({ session: z.object({ id: z.string() }), transport: z.object({ sdp: z.string() }) });

export async function createLiveSession(input: {
  key: string;
  path?: string;
  sdpOffer: string;
  session: Record<string, unknown>;
}): Promise<CreatedSession> {
  const response = await fetch(`https://api.openai.com${input.path ?? '/v1/live/sessions'}`, {
    body: JSON.stringify({ session: input.session, transport: { sdp: input.sdpOffer, type: 'webrtc' } }),
    headers: { authorization: `Bearer ${input.key}`, 'content-type': 'application/json' },
    method: 'POST',
  });
  const text = await response.text();
  if (response.status !== 201) {
    return { body: text, kind: 'refused', status: response.status };
  }
  const parsed = createdBody.parse(JSON.parse(text));
  return { kind: 'created', sdpAnswer: parsed.transport.sdp, sessionID: parsed.session.id };
}
