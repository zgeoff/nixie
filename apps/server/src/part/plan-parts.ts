import type { FeatureID } from '@heynixie/contract';
import type { AnyPartDeclaration } from '../types';
import { PartPlanError } from './part-plan-error';

export interface PartPlan<Values> {
  // the parts of the features that are on, and every core part, in declared order
  readonly parts: readonly AnyPartDeclaration<Values>[];

  // the names of the parts that a feature that is off left out
  readonly leftOut: ReadonlySet<keyof Values>;
}

// Leaves out each part whose feature is off, and throws when a part's declarations break a rule of
// features: a core part that needs a feature part, a feature part that needs another feature's part
// without requiring that feature, or a part that requires a feature that is off.
export function planParts<Values>(
  featuresOn: readonly FeatureID[],
  declarations: readonly AnyPartDeclaration<Values>[],
): PartPlan<Values> {
  const featureOf = new Map(
    declarations.map((declaration) => [declaration.name, declaration.feature]),
  );

  for (const declaration of declarations) {
    if (declaration.feature === undefined) {
      for (const name of declaration.needs) {
        const needed = featureOf.get(name);

        if (needed !== undefined) {
          throw new PartPlanError(
            `core part ${String(declaration.name)} lists part ${String(name)} of the ${needed} feature in needs. A core part reads a feature part only through parts.find, so list it in uses.`,
          );
        }
      }
    }
  }

  const parts: AnyPartDeclaration<Values>[] = [];

  const leftOut = new Set<keyof Values>();

  for (const declaration of declarations) {
    if (declaration.feature !== undefined && !featuresOn.includes(declaration.feature)) {
      leftOut.add(declaration.name);
      continue;
    }

    for (const required of declaration.requires ?? []) {
      if (!featuresOn.includes(required)) {
        throw new PartPlanError(
          `part ${String(declaration.name)} of the ${declaration.feature ?? 'core'} feature requires the ${required} feature, which is off. Turn ${required} on in the config, or turn ${declaration.feature ?? 'its feature'} off.`,
        );
      }
    }

    for (const name of declaration.needs) {
      const needed = featureOf.get(name);

      if (
        declaration.feature !== undefined &&
        needed !== undefined &&
        needed !== declaration.feature &&
        !(declaration.requires ?? []).includes(needed)
      ) {
        throw new PartPlanError(
          `part ${String(declaration.name)} of the ${declaration.feature} feature lists part ${String(name)} of the ${needed} feature in needs, but does not require the ${needed} feature. Add ${needed} to its requires.`,
        );
      }
    }

    parts.push(declaration);
  }

  return { parts, leftOut };
}
