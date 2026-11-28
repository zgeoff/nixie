import type { LeakExceptions } from '../types';

// The places where the code breaks the feature rules today. Each entry names the work item whose
// retrofit removes it, or says why an ordinary word that matches a feature stays. A test fails on an
// entry that matches nothing.
export const leakExceptions: LeakExceptions = {
  owned: {
    google: ['modules/api/src/connection'],
    voice: [
      'libs/contract/src/contract/calls-contract.ts',
      'modules/api/src/session/create-calls-off-procedures.ts',
    ],
    devices: [
      'libs/contract/src/contract/contract.ts',
      'libs/contract/src/contract/devices-contract.ts',
      'modules/api/src/session/create-devices-off-procedures.ts',
      'modules/api/src/session/feature-procedures.ts',
      'modules/api/src/enrolment/claim-enrolment-code.ts',
      'modules/api/src/live/create-live-procedures.ts',
      'modules/api/src/session/create-session-procedures.ts',
    ],
    images: [
      'libs/contract/src/contract/contract.ts',
      'libs/contract/src/contract/images-contract.ts',
      'libs/contract/src/contract/live-topic-schema.ts',
      'modules/api/src/image',
    ],
    computer: [
      'libs/contract/src/contract/computer-contract.ts',
      'libs/contract/src/contract/contract.ts',
      'libs/contract/src/contract/live-topic-schema.ts',
      'modules/api/src/computer',
      'modules/api/src/index.ts',
      'modules/api/src/types.ts',
      'modules/sandbox/src/sandbox/sandbox-image-keys.ts',
      'modules/sandbox/src/sandbox/sandbox-spec-schema.ts',
      'modules/sandbox/src/types.ts',
    ],
    code: [
      'libs/contract/src/contract/contract.ts',
      'libs/contract/src/file/code-file-schema.ts',
      'modules/api/src/image/write-image-forget.ts',
      'modules/api/src/record/write-record-forget.ts',
      'modules/api/src/types.ts',
      'modules/sandbox/src/sandbox/sandbox-image-keys.ts',
      'modules/sandbox/src/sandbox/sandbox-kinds.ts',
      'modules/sandbox/src/sandbox/sandbox-sizes.ts',
    ],
  },
  names: [
    {
      where: 'modules/tasks/src/index.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the code-made summary of a run end, text that code wrote and no sandbox',
    },
    {
      where: 'modules/tasks/src/report/code-made-summaries.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the code-made summary of a run end, text that code wrote and no sandbox',
    },
    {
      where: 'modules/tasks/src/run/write-run-end-in-transaction.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the code-made summary of a run end, text that code wrote and no sandbox',
    },
    {
      where: 'modules/log/src/record/decision-schema.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the code check of a policy decision, a check that code runs and no sandbox',
    },
    {
      where: 'modules/log/src/types.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the code check of a policy decision, a check that code runs and no sandbox',
    },
    {
      where: 'modules/policy/src/consent/check-consent.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the code check of a policy decision, a check that code runs and no sandbox',
    },
    {
      where: 'modules/policy/src/rule/make-decision-point.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the code check of a policy decision, a check that code runs and no sandbox',
    },
    {
      where: 'modules/policy/src/rule/to-stored-decision.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the code check of a policy decision, a check that code runs and no sandbox',
    },
    {
      where: 'modules/policy/src/condition/build-condition-view.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the part of a condition shown as code on a card, text and no sandbox',
    },
    {
      where: 'modules/policy/src/condition/render-condition-words.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the part of a condition shown as code on a card, text and no sandbox',
    },
    {
      where: 'modules/policy/src/condition/types.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the part of a condition shown as code on a card, text and no sandbox',
    },
    {
      where: 'libs/contract/src/contract/passkey-contract.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the host sign-in code, a one-time code and no sandbox',
    },
    {
      where: 'libs/contract/src/contract/memory-view-contract.ts',
      names: ['search'],
      removedBy: 'never',
      reason: 'the search mode of the memory view, and not the web search feature',
    },
    {
      where: 'libs/contract',
      names: ['mcp', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/api/src/enrolment/claim-enrolment-code.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the enrolment code, a one-time code and no sandbox',
    },
    {
      where: 'modules/api/src/enrolment/create-secret.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the enrolment code, a one-time code and no sandbox',
    },
    {
      where: 'modules/api/src/enrolment/write-enrolment-code.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the enrolment code, a one-time code and no sandbox',
    },
    {
      where: 'modules/api/src/enrolment/write-issued-code.ts',
      names: ['code'],
      removedBy: 'never',
      reason: 'the enrolment code, a one-time code and no sandbox',
    },
    {
      where: 'modules/api/src/passkey',
      names: ['code'],
      removedBy: 'never',
      reason: 'the sign-in code, a one-time code and no sandbox',
    },
    {
      where: 'modules/api/src/memory/create-memory-view-procedures.ts',
      names: ['search'],
      removedBy: 'never',
      reason: 'the search mode of the memory view, and not the web search feature',
    },
    {
      where: 'modules/api',
      names: ['coding', 'mail', 'mcp', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/api/src/kept/write-owner-message.ts',
      names: ['images'],
      removedBy: 'never',
      reason: 'the photos the owner attaches to a message, and not the image tools',
    },
    {
      where: 'modules/connections/src/consent',
      names: ['code'],
      removedBy: 'never',
      reason: 'the OAuth authorization code and its verifier, and no sandbox',
    },
    {
      where: 'modules/budgets',
      names: ['spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/credentials',
      names: ['code'],
      removedBy: 'never',
      reason: 'the OAuth code verifier, and no sandbox',
    },
    {
      where: 'modules/credentials',
      names: ['atc'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/definitions',
      names: ['mcp'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/log',
      names: ['coding', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/memory',
      names: ['search'],
      removedBy: 'never',
      reason: 'the search mode of memory recall, and not the web search feature',
    },
    {
      where: 'modules/models',
      names: ['openai'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/models/src/role/role-needs.ts',
      names: ['images'],
      removedBy: 'never',
      reason: 'a model that reads the images in its input, and not the image tools',
    },
    {
      where: 'modules/models/src/session/model-session-opened-codec.ts',
      names: ['images'],
      removedBy: 'never',
      reason:
        'a model session rebuilt because the images in its input filled it, and not the image tools',
    },
    {
      where: 'modules/notebook',
      names: ['search'],
      removedBy: 'never',
      reason: 'the search mode of the note index, and not the web search feature',
    },
    {
      where: 'modules/policy',
      names: ['coding', 'mcp', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/policy/src/place',
      names: ['phone'],
      removedBy: 'never',
      reason:
        'the phone kind of a place key, a phone number of any channel and not the phone feature',
    },
    {
      where: 'modules/proposals',
      names: ['mcp'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/sandbox',
      names: ['coding'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/sessions',
      names: ['mail', 'mcp', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/sessions/src/task/read-started-run.ts',
      names: ['code'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/sessions/src/turn/run-resumed-turn.ts',
      names: ['images'],
      removedBy: 'never',
      reason:
        'a model session rebuilt because the images in its input filled it, and not the image tools',
    },
    {
      where: 'modules/sessions/src/types.ts',
      names: ['images'],
      removedBy: 'never',
      reason:
        'a model session rebuilt because the images in its input filled it, and not the image tools',
    },
    {
      where: 'modules/sessions/src/utils/memory-recalled-codec.ts',
      names: ['search'],
      removedBy: 'never',
      reason: 'the search mode of memory recall, and not the web search feature',
    },
    {
      where: 'modules/skills',
      names: ['github'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/tasks',
      names: ['mail', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/tools',
      names: ['mcp'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/triggers',
      names: ['mail'],
      removedBy: 'GEO-2881',
    },
  ],
  imports: [
    { where: 'modules/actions', imports: ['@heynixie/connectors'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/coding'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/connectors'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/mail'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/mcp'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/spend'], removedBy: 'GEO-2881' },
    { where: 'modules/sessions', imports: ['@heynixie/connectors'], removedBy: 'GEO-2881' },
    { where: 'modules/sessions', imports: ['@heynixie/spend'], removedBy: 'GEO-2881' },
  ],
};
