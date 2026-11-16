import type { ContractOutputs } from '@heynixie/contract';
import { listedStateSchema } from '@heynixie/contract';

export type ListedState = NonNullable<
  ContractOutputs['tasks']['list']['tasks'][number]['listedState']
>;

// The states that the dashboard's state filter offers, in the order the schema lists them.
export const listedStates: readonly ListedState[] = listedStateSchema.options;
