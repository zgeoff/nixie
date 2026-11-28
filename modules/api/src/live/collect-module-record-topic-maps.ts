import { actionsRecordTopics } from '@heynixie/actions';
import { budgetRecordTopics } from '@heynixie/budgets';
import { codingRecordTopics } from '@heynixie/coding';
import {
  definitionTaskRecordTopics,
  definitionsSeededRecordTopics,
  rulesRecordTopics,
} from '@heynixie/definitions';
import { mailRecordTopics } from '@heynixie/mail';
import { mcpRecordTopics } from '@heynixie/mcp';
import { memoryRecordTopics } from '@heynixie/memory';
import { modelsRecordTopics } from '@heynixie/models';
import { notebookRecordTopics } from '@heynixie/notebook';
import { policyRecordTopics } from '@heynixie/policy';
import { promptsRecordTopics } from '@heynixie/prompts';
import { proposalRecordTopics } from '@heynixie/proposals';
import { remindersRecordTopics } from '@heynixie/reminders';
import { sessionsRecordTopics, workerRecordTopics } from '@heynixie/sessions';
import { skillsRecordTopics } from '@heynixie/skills';
import { spendRecordTopics } from '@heynixie/spend';
import { tasksRecordTopics } from '@heynixie/tasks';
import { toolsRecordTopics } from '@heynixie/tools';
import { triggersRecordTopics } from '@heynixie/triggers';
import { turnInputsRecordTopics } from '@heynixie/turn-inputs';
import { apiRecordTopics } from '../api/api-record-topics';

// The topic map of every module that owns record kinds, the API serves, but the log, which registers its own.
export function collectModuleRecordTopicMaps() {
  return [
    actionsRecordTopics,
    apiRecordTopics,
    budgetRecordTopics,
    codingRecordTopics,
    definitionTaskRecordTopics,
    definitionsSeededRecordTopics,
    mcpRecordTopics,
    mailRecordTopics,
    memoryRecordTopics,
    modelsRecordTopics,
    notebookRecordTopics,
    policyRecordTopics,
    promptsRecordTopics,
    proposalRecordTopics,
    remindersRecordTopics,
    rulesRecordTopics,
    sessionsRecordTopics,
    skillsRecordTopics,
    spendRecordTopics,
    tasksRecordTopics,
    toolsRecordTopics,
    triggersRecordTopics,
    turnInputsRecordTopics,
    workerRecordTopics,
  ];
}
