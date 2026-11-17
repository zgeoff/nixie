// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { faker } from '@faker-js/faker';
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';
import { store } from './store';

const rules = mockImplementer.rules;
const dayMs = 24 * 60 * 60 * 1000;
const ruleSentence = 'Allow `mail.send`, as a stand-in.';

export const mockMandateProcedures = {
  editProposedRule: rules.editProposedRule.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const input = options.input;

    const row = store.approvalRows.findFirst((query) =>
      query.where({ proposalID: input.proposalID }),
    );

    if (row?.cause !== 'proposed_rule') {
      throw options.errors.NOT_FOUND();
    }

    if (row.state !== 'pending' && row.state !== 'deferred') {
      throw options.errors.CLOSED({ data: { state: row.state } });
    }

    if (row.actionHash !== input.actionHash) {
      throw options.errors.CONFLICT({ data: { current: { actionHash: row.actionHash } } });
    }

    if (input.rule['outcome'] !== 'allow') {
      throw options.errors.INVALID({
        data: { faults: ['outcome: an edited rule stays an allow rule'] },
      });
    }

    await store.approvalRows.update((query) => query.where({ proposalID: row.proposalID }), {
      data: (current) => {
        current.state = 'withdrawn';
      },
    });

    const created = await store.approvalRows.create({
      approveLabel: row.approveLabel,
      cause: 'proposed_rule',
      choices: [...row.choices],
      fields: { ...row.fields },
      kind: 'internal_change',
      proposedRule: input.rule,
      riskClass: 'always_ask',
      sentence: 'Allow the edited rule, as a stand-in.',
      thread: null,
    });

    return { proposalID: created.proposalID };
  }),

  proposeMandate: rules.proposeMandate.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const input = options.input;

    const expires =
      input.expires === undefined ? Date.now() + dayMs / 2 : Date.parse(input.expires);

    if (expires <= Date.now()) {
      const now = new Date().toISOString();

      throw options.errors.INVALID({
        data: {
          faults: [`expires: expires_past (now ${now})`],
          expiry: { reason: 'expires_past', now },
        },
      });
    }

    if (expires > Date.now() + dayMs) {
      const latestExpiry = new Date(Date.now() + dayMs).toISOString();

      throw options.errors.INVALID({
        data: {
          faults: [`expires: expires_beyond_max (maxHours 24, latestExpiry ${latestExpiry})`],
          expiry: { reason: 'expires_beyond_max', maxHours: 24, latestExpiry },
        },
      });
    }

    const mandateID = faker.string.alphanumeric({ length: 10, casing: 'lower' });

    const row = await store.approvalRows.create({
      approveLabel: 'Start the mandate',
      cause: 'mandate',
      choices: ['approve', 'defer', 'decline'],
      deadlineAt: new Date(expires),
      fields: { title: input.title, ends: new Date(expires).toISOString(), 'rule 1': ruleSentence },
      kind: 'internal_change',
      lapsesAt: new Date(expires),
      riskClass: 'always_ask',
      sentence: ruleSentence,
      thread: null,
    });

    return { proposalID: row.proposalID, mandateID, expires: new Date(expires) };
  }),

  listMandates: rules.listMandates.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return {
      mandates: store.mandates.all().map((mandate) => ({
        mandateID: mandate.mandateID,
        title: mandate.title,
        rules: mandate.rules.map((rule) => ({ ...rule })),
        startedAt: mandate.startedAt,
        expires: mandate.expires,
      })),
    };
  }),

  endMandate: rules.endMandate.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const mandateID = options.input.mandateID;
    const found = store.mandates.findFirst((query) => query.where({ mandateID }));

    if (found === undefined) {
      throw options.errors.NOT_FOUND();
    }

    store.mandates.delete((query) => query.where({ mandateID }));

    return { mandateID, state: 'ended' as const };
  }),
};
