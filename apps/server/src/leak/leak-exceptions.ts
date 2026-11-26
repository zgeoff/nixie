import type { LeakExceptions } from '../types';

// The places where the code breaks the feature rules today. Each entry names the work item whose
// retrofit removes it, or says why an ordinary word that matches a feature stays. A test fails on an
// entry that matches nothing.
export const leakExceptions: LeakExceptions = {
  names: [
    {
      where: 'libs/contract',
      names: ['computer'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'libs/contract/src/contract/contract.ts',
      names: ['code'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'libs/contract/src/file/code-file-schema.ts',
      names: ['code'],
      removedBy: 'GEO-2878',
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
      names: ['google'],
      removedBy: 'GEO-2879',
    },
    {
      where: 'libs/contract',
      names: ['devices', 'voice'],
      removedBy: 'GEO-2880',
    },
    {
      where: 'libs/contract',
      names: ['images', 'mcp', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/api',
      names: ['computer'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/api/src/image/write-image-forget.ts',
      names: ['code'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/api/src/record/write-record-forget.ts',
      names: ['code'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/api/src/types.ts',
      names: ['code'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/api/src/enrolment',
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
      names: ['google'],
      removedBy: 'GEO-2879',
    },
    {
      where: 'modules/api',
      names: ['devices', 'voice'],
      removedBy: 'GEO-2880',
    },
    {
      where: 'modules/api',
      names: ['coding', 'images', 'mail', 'mcp', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/connections/src/consent',
      names: ['code'],
      removedBy: 'never',
      reason: 'the OAuth authorization code and its verifier, and no sandbox',
    },
    {
      where: 'modules/connections',
      names: ['google'],
      removedBy: 'GEO-2879',
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
      names: ['voice'],
      removedBy: 'GEO-2880',
    },
    {
      where: 'modules/definitions',
      names: ['mcp'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/log',
      names: ['code'],
      removedBy: 'GEO-2878',
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
      names: ['images', 'openai'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/notebook',
      names: ['search'],
      removedBy: 'never',
      reason: 'the search mode of the note index, and not the web search feature',
    },
    {
      where: 'modules/policy',
      names: ['code'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/policy',
      names: ['coding', 'mcp', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/proposals',
      names: ['mcp'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/sandbox',
      names: ['code', 'computer'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/sandbox',
      names: ['coding'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/sessions',
      names: ['computer'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/sessions',
      names: ['voice'],
      removedBy: 'GEO-2880',
    },
    {
      where: 'modules/sessions',
      names: ['images', 'mail', 'mcp', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/sessions/src/utils/memory-recalled-codec.ts',
      names: ['search'],
      removedBy: 'never',
      reason: 'the search mode of memory recall, and not the web search feature',
    },
    {
      where: 'modules/tasks',
      names: ['code'],
      removedBy: 'GEO-2878',
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
    { where: 'modules/api', imports: ['@heynixie/calls'], removedBy: 'GEO-2880' },
    { where: 'modules/api', imports: ['@heynixie/coding'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/connectors'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/devices'], removedBy: 'GEO-2880' },
    { where: 'modules/api', imports: ['@heynixie/mail'], removedBy: 'GEO-2881' },
    {
      where: 'modules/connections',
      imports: ['@heynixie/connectors'],
      removedBy: 'GEO-2879',
      reason:
        "connections owns the core Connector interface, and reaches connectors only for Google's code, which the retrofit moves into a connector-google adapter",
    },
    { where: 'modules/api', imports: ['@heynixie/mcp'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/spend'], removedBy: 'GEO-2881' },
    { where: 'modules/definitions', imports: ['@heynixie/calls'], removedBy: 'GEO-2880' },
    { where: 'modules/sessions', imports: ['@heynixie/calls'], removedBy: 'GEO-2880' },
    { where: 'modules/sessions', imports: ['@heynixie/connectors'], removedBy: 'GEO-2881' },
    { where: 'modules/sessions', imports: ['@heynixie/devices'], removedBy: 'GEO-2880' },
    { where: 'modules/sessions', imports: ['@heynixie/spend'], removedBy: 'GEO-2881' },
  ],
};
