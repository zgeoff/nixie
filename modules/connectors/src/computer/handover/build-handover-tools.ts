import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import type { ComputerToolOptions } from '../computer-tool-options';
import { refuseComputer } from '../run-computer-call';

// The tools by which the assistant asks the user to take the desktop, withdraws the ask, and takes
// the desktop back. They belong to the conversation alone.
export function buildHandoverTools(options: ComputerToolOptions): readonly ToolDefinition[] {
  return [buildHandoverTool(options), buildCancelTool(options), buildTakeBackTool(options)];
}

export const handoverToolNames = [
  'computer.handover',
  'computer.handover_cancel',
  'computer.take_back',
] as const;

const maxReasonChars = 500;
const handoverArguments = z.object({ reason: z.string().min(1).max(maxReasonChars) });

function buildHandoverTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.handover',
    description: [
      'Asks the user to take over the computer, for what only a person can do: a CAPTCHA or other ',
      'human check, a bank check, or a page that wants a person. The reason is shown to the user ',
      'on a banner on every open client, so say what they will find and why it needs them. The ',
      'call changes nothing else: the computer stays yours until the user presses Take over. ',
      'Your clicks, typing and commands then wait, and you read the screen. You learn that the ',
      'user handed the computer back, or that the ask lapsed, as a message of its own. One ask ',
      'stands at a time: ALREADY_ASKED means it still stands, and TAKEN_OVER means the user ',
      'already holds the computer.',
    ].join(''),
    input: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          minLength: 1,
          maxLength: maxReasonChars,
          description: 'what needs the user, such as "itch.io asks for a CAPTCHA"',
        },
      },
      required: ['reason'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { asked: { type: 'boolean' }, refused: { type: 'object' } },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { asked: 'owner_data', refused: 'untrusted' },
    },
    execution: 'direct',
    run: async (call) => {
      const input = handoverArguments.parse(call.input);

      const asked = await options.computer.handover.ask(input.reason);

      if (asked.kind === 'asked') {
        return { status: 'ok', result: { asked: true } };
      }

      return {
        status: 'ok',
        ...(asked.kind === 'already_asked'
          ? refuseComputer(
              'ALREADY_ASKED',
              'an ask for a take-over already stands; wait for the user, or cancel it first',
            )
          : refuseComputer('TAKEN_OVER', 'the user already holds the computer')),
      };
    },
  };
}

function buildCancelTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.handover_cancel',
    description: [
      'Withdraws your standing ask for a take-over, when you got past the problem or gave up on ',
      'it. The banner goes from every client. NOT_ASKED means no ask stands.',
    ].join(''),
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      type: 'object',
      properties: { cancelled: { type: 'boolean' }, refused: { type: 'object' } },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { cancelled: 'owner_data', refused: 'untrusted' },
    },
    execution: 'direct',
    run: async () => {
      const cancelled = await options.computer.handover.cancel();

      return {
        status: 'ok',
        ...(cancelled.kind === 'cancelled'
          ? { result: { cancelled: true } }
          : refuseComputer('NOT_ASKED', 'no ask for a take-over stands')),
      };
    },
  };
}

function buildTakeBackTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.take_back',
    description: [
      'Takes the computer back from the user at once, ending their take-over, for a hold you no ',
      'longer want to wait for. The user’s input stops reaching the desktop. NOT_TAKEN_OVER means ',
      'the user holds nothing. Use it sparingly: the user is at the screen.',
    ].join(''),
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      type: 'object',
      properties: { durationSeconds: { type: 'number' }, refused: { type: 'object' } },
      additionalProperties: false,
    },
    declaration: {
      effects: ['computer_take_back'],
      destinations: [],
      amount: null,
      content: [],
      results: { durationSeconds: 'owner_data', refused: 'untrusted' },
    },
    execution: 'direct',
    run: async () => {
      const ended = await options.computer.takeover.end('assistant');

      return {
        status: 'ok',
        ...(ended.kind === 'ended'
          ? { result: { durationSeconds: ended.durationSeconds } }
          : refuseComputer('NOT_TAKEN_OVER', 'the user does not hold the computer')),
      };
    },
  };
}
