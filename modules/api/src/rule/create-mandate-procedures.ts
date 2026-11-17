// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readMessageTimeZone } from '@heynixie/connectors';
import {
  mandateInputSchema,
  readActiveMandates,
  readMandateEndReason,
  readMandateTitles,
  writeMandateEnd,
  writeMandateProposal,
  writeProposedRuleEdit,
} from '@heynixie/definitions';
import type { MandateRefusal } from '@heynixie/definitions';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { buildInputHash } from '../utils/build-input-hash';
import { defaultApprovalSettings, defaultPolicySettings } from '../utils/default-api-settings';
import { runCheckedRuleAction } from './run-checked-rule-action';

type RuleProcedureContext = APIContext & { readonly runInForceSeed: () => Promise<unknown> };

const storedMandateSchema = z.object({
  proposalID: z.string(),
  mandateID: z.string(),
  expires: z.number(),
});

const endedMandateSchema = z.object({
  state: z.enum(['ended', 'expired']),
  isNew: z.boolean(),
});

export function createMandateProcedures(context: RuleProcedureContext) {
  const rules = apiImplementer.rules;

  const maxHours =
    context.settings.policy?.mandates.maxHours ?? defaultPolicySettings.mandates.maxHours;

  const defaultZone =
    context.settings.approvals?.defaultZone ?? defaultApprovalSettings.defaultZone;

  return {
    editProposedRule: rules.editProposedRule.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const input = options.input;

      const run = await runCheckedRuleAction(context, caller, {
        clientActionID: input.clientActionID,
        procedure: 'rules.editProposedRule',
        inputHash: buildInputHash({
          proposalID: input.proposalID,
          actionHash: input.actionHash,
          rule: JSON.stringify(input.rule),
        }),
        write: async (tx) => {
          const edit = await writeProposedRuleEdit(tx, context, input);

          return edit.status === 'edited'
            ? { status: 'done', result: { proposalID: edit.proposalID } }
            : { status: 'refused', refusal: edit };
        },
      });

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (run.status === 'refused') {
        const refusal = run.refusal;

        if (refusal.status === 'conflict') {
          throw options.errors.CONFLICT({ data: { current: { actionHash: refusal.actionHash } } });
        }

        if (refusal.status === 'closed') {
          throw options.errors.CLOSED({ data: { state: toClosedState(refusal.state) } });
        }

        if (refusal.status === 'invalid') {
          throw options.errors.INVALID({ data: { faults: [...refusal.faults] } });
        }

        throw options.errors.NOT_FOUND();
      }

      return { proposalID: z.string().parse(run.result['proposalID']) };
    }),

    proposeMandate: rules.proposeMandate.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const { clientActionID, ...form } = options.input;
      const parsed = mandateInputSchema.safeParse(form);

      if (!parsed.success) {
        throw options.errors.INVALID({
          data: {
            faults: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
          },
        });
      }

      const run = await runCheckedRuleAction(context, caller, {
        clientActionID,
        procedure: 'rules.proposeMandate',
        inputHash: buildInputHash({
          rules: JSON.stringify(form.rules),
          expires: form.expires ?? null,
        }),
        write: async (tx) => {
          const proposed = await writeMandateProposal(
            tx,
            context,
            {
              maxHours,
              readZone: async (reader) => {
                const zone = await readMessageTimeZone({
                  writer: { ...context.log.writer, db: reader },
                });

                return zone ?? defaultZone;
              },
            },
            { input: parsed.data, proposedBy: 'owner' },
          );

          return proposed.status === 'proposed'
            ? {
                status: 'done',
                result: {
                  proposalID: proposed.proposalID,
                  mandateID: proposed.mandateID,
                  expires: proposed.expires,
                },
              }
            : { status: 'refused', refusal: proposed };
        },
      });

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (run.status === 'refused') {
        throw options.errors.INVALID({ data: buildExpiryError(run.refusal) });
      }

      const stored = storedMandateSchema.parse(run.result);

      return { ...stored, expires: new Date(stored.expires) };
    }),

    listMandates: rules.listMandates.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const active = await readActiveMandates(context.log.writer.db);

      const titles = await readMandateTitles(
        context.log,
        active.map((mandate) => mandate.mandateID),
      );

      return {
        mandates: active.map((mandate) => ({
          mandateID: mandate.mandateID,
          title: titles.get(mandate.mandateID) ?? null,
          rules: [...mandate.rules],
          startedAt: new Date(mandate.startedAt),
          expires: new Date(mandate.expires),
        })),
      };
    }),

    endMandate: rules.endMandate.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const mandateID = options.input.mandateID;

      const run = await runCheckedRuleAction(context, caller, {
        clientActionID: options.input.clientActionID,
        procedure: 'rules.endMandate',
        inputHash: buildInputHash({ mandateID }),
        write: async (tx) => {
          const end = await writeMandateEnd(tx, context, { mandateID, reason: 'ended' });

          if (end.status === 'ended') {
            return { status: 'done', result: { mandateID, state: 'ended', isNew: true } };
          }

          const reason = await readMandateEndReason(
            { ...context.log, writer: { ...context.log.writer, db: tx } },
            mandateID,
          );

          return reason === null
            ? { status: 'refused', refusal: 'not_found' }
            : { status: 'done', result: { mandateID, state: reason, isNew: false } };
        },
      });

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      if (run.status === 'refused') {
        throw options.errors.NOT_FOUND();
      }

      const ended = endedMandateSchema.parse(run.result);

      if (ended.isNew && !run.isReplay) {
        await context.runInForceSeed();
      }

      return { mandateID, state: ended.state };
    }),
  };
}

const closedStates = ['approved', 'declined', 'lapsed', 'withdrawn'] as const;

// A closed row is never pending or deferred, which the contract's error leaves out.
function toClosedState(state: string): (typeof closedStates)[number] {
  return z.enum(closedStates).parse(state);
}

function buildExpiryError(refusal: MandateRefusal) {
  return match(refusal)
    .with({ reason: 'expires_past' }, (past) => ({
      faults: [`expires: ${past.reason} (now ${past.now})`],
      expiry: { reason: past.reason, now: past.now },
    }))
    .with({ reason: 'expires_beyond_max' }, (beyond) => ({
      faults: [
        `expires: ${beyond.reason} (maxHours ${beyond.maxHours}, latestExpiry ${beyond.latestExpiry})`,
      ],
      expiry: {
        reason: beyond.reason,
        maxHours: beyond.maxHours,
        latestExpiry: beyond.latestExpiry,
      },
    }))
    .exhaustive();
}
