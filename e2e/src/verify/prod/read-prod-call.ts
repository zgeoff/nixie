import { clientHeaderName } from '@heynixie/contract';
import { WringerError } from '@wringer/core';
import type { HttpClient } from '@wringer/http';
import { z } from 'zod';

type Env = Readonly<Record<string, string | undefined>>;

const rpcAnswerSchema = z.object({ json: z.looseObject({}) });

// One read of nixie's API with the read-only token, in oRPC's wire form. Its answer holds the
// owner's data, so the driver keeps no evidence file of it.
export async function readProdCall(
  client: HttpClient,
  env: Env,
  path: string,
  input: unknown,
): Promise<unknown> {
  const token = env['NIXIE_PROD_TOKEN'];

  if (token === undefined || token === '') {
    throw new WringerError('environment', {
      message: 'The prod reads need NIXIE_PROD_TOKEN.',
      hint: "Set NIXIE_PROD_TOKEN to nixie's read-only token; the verify skill says where it lives.",
    });
  }

  const response = await client.request({
    method: 'POST',
    path,
    headers: { authorization: `Bearer ${token}`, [clientHeaderName]: 'verify' },
    json: { json: input },
    evidence: false,
  });

  if (response.status !== 200) {
    throw new WringerError('check-failed', {
      message: `POST ${path} answered ${String(response.status)}`,
    });
  }

  const answer = rpcAnswerSchema.safeParse(response.json);

  if (!answer.success) {
    throw new WringerError('check-failed', {
      message: `POST ${path} answered 200 with no oRPC output`,
    });
  }

  return answer.data.json;
}
