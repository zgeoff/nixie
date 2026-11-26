import type { LeakExceptions } from '../types';

// The places where the code breaks the feature rules today. Each entry names the work item whose
// retrofit removes it, and a test fails on an entry that matches nothing.
export const leakExceptions: LeakExceptions = {
  names: [
    {
      where: 'libs/contract',
      names: ['code', 'computer'],
      removedBy: 'GEO-2878',
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
      names: ['images', 'mcp', 'search', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/api',
      names: ['code', 'computer'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/api',
      names: ['google', 'mail'],
      removedBy: 'GEO-2879',
    },
    {
      where: 'modules/api',
      names: ['devices', 'voice'],
      removedBy: 'GEO-2880',
    },
    {
      where: 'modules/api',
      names: ['coding', 'images', 'mcp', 'search', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/backup',
      names: ['code'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/budgets',
      names: ['spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/credentials',
      names: ['code'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/credentials',
      names: ['atc'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/definitions',
      names: ['code'],
      removedBy: 'GEO-2878',
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
      names: ['code'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/memory',
      names: ['search'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/models',
      names: ['images', 'openai'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/notebook',
      names: ['code'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/notebook',
      names: ['search'],
      removedBy: 'GEO-2881',
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
      where: 'modules/prompts',
      names: ['code'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/proposals',
      names: ['mcp'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/reminders',
      names: ['code'],
      removedBy: 'GEO-2878',
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
      names: ['mail'],
      removedBy: 'GEO-2879',
    },
    {
      where: 'modules/sessions',
      names: ['voice'],
      removedBy: 'GEO-2880',
    },
    {
      where: 'modules/sessions',
      names: ['images', 'mcp', 'search', 'spend'],
      removedBy: 'GEO-2881',
    },
    {
      where: 'modules/tasks',
      names: ['code'],
      removedBy: 'GEO-2878',
    },
    {
      where: 'modules/tasks',
      names: ['mail'],
      removedBy: 'GEO-2879',
    },
    {
      where: 'modules/tasks',
      names: ['spend'],
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
      removedBy: 'GEO-2879',
    },
  ],
  imports: [
    { where: 'modules/actions', imports: ['@heynixie/connectors'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/calls'], removedBy: 'GEO-2880' },
    { where: 'modules/api', imports: ['@heynixie/coding'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/connections'], removedBy: 'GEO-2879' },
    { where: 'modules/api', imports: ['@heynixie/connectors'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/devices'], removedBy: 'GEO-2880' },
    { where: 'modules/api', imports: ['@heynixie/mail'], removedBy: 'GEO-2879' },
    { where: 'modules/api', imports: ['@heynixie/mcp'], removedBy: 'GEO-2881' },
    { where: 'modules/api', imports: ['@heynixie/spend'], removedBy: 'GEO-2881' },
    { where: 'modules/definitions', imports: ['@heynixie/calls'], removedBy: 'GEO-2880' },
    { where: 'modules/sessions', imports: ['@heynixie/calls'], removedBy: 'GEO-2880' },
    { where: 'modules/sessions', imports: ['@heynixie/connectors'], removedBy: 'GEO-2881' },
    { where: 'modules/sessions', imports: ['@heynixie/devices'], removedBy: 'GEO-2880' },
    { where: 'modules/sessions', imports: ['@heynixie/spend'], removedBy: 'GEO-2881' },
  ],
};
