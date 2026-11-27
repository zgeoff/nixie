import type { ToolDefinition } from '@heynixie/tools';
import type { PhoneContext, TextForgetter } from '../types';
import { buildPhoneForgetTool } from './build-phone-forget-tool';
import { buildPhoneListTool } from './build-phone-list-tool';
import { buildPhoneReadTool } from './build-phone-read-tool';
import { buildPhoneSendTool } from './build-phone-send-tool';
import { buildPhoneWakeCancelTool } from './build-phone-wake-cancel-tool';
import { buildPhoneWakeListTool } from './build-phone-wake-list-tool';
import { buildPhoneWakeSetTool } from './build-phone-wake-set-tool';

// The tools that a model calls on the assistant's own phone. The send is a queued tool, which the
// connector of the phone module runs.
export function buildPhoneTools(context: PhoneContext, forgetter: TextForgetter): ToolDefinition[] {
  return [
    buildPhoneListTool(context),
    buildPhoneReadTool(context),
    buildPhoneSendTool(),
    buildPhoneForgetTool(forgetter),
    buildPhoneWakeSetTool(context),
    buildPhoneWakeListTool(context),
    buildPhoneWakeCancelTool(context),
  ];
}
