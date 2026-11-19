import { WringerError } from '@wringer/core';
import { z } from 'zod';
import { pickVersionRefusal } from './pick-version-refusal';
import { runProdKubectl } from './run-prod-kubectl';

type Env = Readonly<Record<string, string | undefined>>;

const containersSchema = z.array(z.object({ name: z.string(), image: z.string() }));
const conditionsSchema = z.array(z.object({ type: z.string(), status: z.string() })).default([]);

const podSchema = z.object({
  spec: z.object({ containers: containersSchema }),
  status: z.object({ conditions: conditionsSchema }),
});

const templateSchema = z.object({ spec: z.object({ containers: containersSchema }) });
const statefulSetSchema = z.object({ spec: z.object({ template: templateSchema }) });

// The version prod serves, from the image of nixie's pod. NIXIE_PROD_VERSION, when set, names the
// version a deploy just applied.
export async function readProdVersion(env: Env): Promise<{ version: string }> {
  const podText = await runProdKubectl(env, ['get', 'pod', 'nixie-0', '--output', 'json']);

  const statefulSetText = await runProdKubectl(env, [
    'get',
    'statefulset',
    'nixie',
    '--output',
    'json',
  ]);

  const pod = podSchema.parse(JSON.parse(podText));
  const statefulSet = statefulSetSchema.parse(JSON.parse(statefulSetText));
  const expected = env['NIXIE_PROD_VERSION'];

  const picked = pickVersionRefusal({
    podImage: getNixieImage(pod.spec.containers),
    templateImage: getNixieImage(statefulSet.spec.template.spec.containers),
    isReady: pod.status.conditions.some(isReadyCondition),
    expected: expected === '' ? undefined : expected,
  });

  if (picked.kind === 'refused') {
    throw new WringerError('check-failed', { message: picked.message });
  }

  return { version: picked.version };
}

function getNixieImage(containers: z.infer<typeof containersSchema>): string {
  return containers.find((container) => container.name === 'nixie')?.image ?? 'no nixie container';
}

function isReadyCondition(condition: z.infer<typeof conditionsSchema>[number]): boolean {
  return condition.type === 'Ready' && condition.status === 'True';
}
