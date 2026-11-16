import { withWriteTransaction } from '@heynixie/log';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import type { SeedResult } from '../rule/run-seed';
import type { TaskDefineInput } from './build-define-version';
import { buildDefineVersion } from './build-define-version';
import type { DefinitionRequest } from './pick-definition-move';
import { pickDefinitionMove } from './pick-definition-move';
import { readDefinitionHead } from './read-definition-head';
import { readRepoHash } from './read-repo-hash';
import type { StoredTaskDefinition } from './stored-task-definition';
import type { DefinitionChangeResult, DefinitionRefusal, DefinitionsContext } from './types';
import { writeDefinitionChange } from './write-definition-change';

export type DefinitionChangeRequest =
  | { readonly kind: 'define'; readonly input: TaskDefineInput }
  | { readonly kind: 'undefine'; readonly definitionID: string };

interface WrittenChange {
  readonly definitionID: string;
  readonly changeID: string;
  readonly shortID: string;
  readonly seed: SeedResult;
}

// Only the 2 write tools call it, so its caller is always the conversation.
export async function requestDefinitionChange(
  context: DefinitionsContext,
  request: DefinitionChangeRequest,
): Promise<DefinitionChangeResult> {
  if (request.kind === 'undefine') {
    await runSeedBeforeDecision(context);
  }

  const target = buildTarget(context, request);

  if (target.status === 'refused') {
    return target;
  }

  const written = await withWriteTransaction(
    context.log.writer,
    async (tx): Promise<DefinitionChangeResult | WrittenChange> => {
      const inForce = await readDefinitionsInForce(tx);

      if (inForce === null) {
        throw new Error('no definitions are in force yet');
      }

      const decision = pickDefinitionMove(
        {
          repo: await readRepoHash(tx, inForce, target.definitionID),
          head: await readDefinitionHead(tx, target.definitionID),
          now: context.log.writer.clock.now(),
        },
        target.request,
      );

      if (decision.status === 'refused') {
        return decision;
      }

      const change = await writeDefinitionChange(tx, context, {
        inForce,
        move: decision,
        version: target.version,
      });

      return { ...change, definitionID: target.definitionID };
    },
  );

  if (!('seed' in written)) {
    return written;
  }

  context.onSeeded(written.seed);
  context.wakeExport();

  return {
    status: 'changed',
    definitionID: written.definitionID,
    changeID: written.changeID,
    shortID: written.shortID,
  };
}

// The seed of the definitions source runs outside the transaction, so a merge that no seed has read
// counts. When it fails or is refused, the decision goes on with the repo version last read.
async function runSeedBeforeDecision(context: DefinitionsContext): Promise<void> {
  await context.runSeed().catch(() => null);
}

type ChangeTarget =
  | {
      readonly status: 'ready';
      readonly definitionID: string;
      readonly request: DefinitionRequest;
      readonly version: StoredTaskDefinition | null;
    }
  | { readonly status: 'refused'; readonly refusal: DefinitionRefusal };

function buildTarget(context: DefinitionsContext, request: DefinitionChangeRequest): ChangeTarget {
  if (request.kind === 'undefine') {
    return {
      status: 'ready',
      definitionID: request.definitionID,
      request: { kind: 'undefine', definitionID: request.definitionID },
      version: null,
    };
  }

  const built = buildDefineVersion(request.input, context);

  if (built.status === 'invalid') {
    return { status: 'refused', refusal: { code: 'INVALID', reasons: built.reasons } };
  }

  const definitionID = built.definition.definitionID;

  return {
    status: 'ready',
    definitionID,
    request: {
      kind: 'define',
      definitionID,
      isReplace: request.input.definitionID !== undefined,
      version: { hash: built.definition.hash, oneShotAt: built.oneShotAt },
    },
    version: built.definition,
  };
}
