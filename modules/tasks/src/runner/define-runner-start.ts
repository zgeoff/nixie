import type { RunnerStart, RunnerStartPort, TaskStartEnvelope } from './types';

export function defineRunnerStart<Input extends TaskStartEnvelope, Options>(
  start: RunnerStart<Input, Options>,
): RunnerStartPort {
  return {
    schema: start.schema,
    describeInput: start.describeInput,
    declaration: start.declaration,
    storesBuiltOptions: start.storesBuiltOptions,
    plan: async (input, starter, bounds) => {
      const plan = await start.plan(start.schema.parse(input), starter, bounds);

      return plan.status === 'refused'
        ? plan
        : {
            status: 'planned',
            envelope: plan.envelope,
            options: start.encodeOptions(plan.options),
            actions: plan.actions,
            ...(plan.transaction === undefined ? {} : { transaction: plan.transaction }),
          };
    },
  };
}
