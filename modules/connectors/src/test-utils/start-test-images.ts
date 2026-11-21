import type { BudgetsContext } from '@heynixie/budgets';
import { budgetProjections, buildBuiltInBudgets } from '@heynixie/budgets';
import type { JSONObject, Log } from '@heynixie/log';
import type { DecisionPoint, RuleEntry } from '@heynixie/policy';
import { buildAllowingDecisionPoint, readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { buildTestClock } from '@heynixie/testing';
import type { ToolRun } from '@heynixie/tools';
import { buildToolRegistry, findToolDeclaration, runToolCall } from '@heynixie/tools';
import { buildStubActionQueue } from '@heynixie/tools/test-utils';
import { buildImageTools } from '../image/build-image-tools';
import type { ImagesConfig } from '../image/images-config-schema';
import { largestImageBytes } from '../image/pick-room-left';
import type { ImageProvider } from '../types';
import { readToolResult } from './read-tool-result';
import { startTestLog } from './start-test-log';

export interface TestImagesOptions {
  // the provider of each profile, by the profile's key
  readonly providers: Readonly<Record<string, ImageProvider>>;

  // allow rules of the owner, which put the real decision point in force; none allows every call
  readonly rules?: readonly RuleEntry[];

  // what the session's image caps hold; 24 MiB and 100 images when absent
  readonly caps?: { readonly bytes: number; readonly count: number };
  readonly drawTimeoutMs?: number;
}

const prices = { '1024x1024': 40_000, '1536x1024': 60_000, '1024x1536': 60_000 };

// Starts the log and the 7 image tools behind the real tool endpoint, with a stand-in for each
// provider, so a test sends a call and reads what the model, the budgets and the log hold after it.
export async function startTestImages(options: TestImagesOptions) {
  const clock = buildTestClock(Date.parse('2026-11-21T08:00:00.000Z'));

  const started = await startTestLog(clock);

  const log: Log = { ...started, projections: [...started.projections, ...budgetProjections] };
  const spent = { bytes: 0, count: 0 };
  const caps = options.caps ?? { bytes: 24 * 1024 * 1024, count: 100 };

  const held = new Set<string>();

  const images: ImagesConfig = {
    default: 'main',
    profiles: {
      main: { provider: 'openai', model: 'model-a', credential: 'deployment:key-a', prices },
      second: { provider: 'gemini', model: 'model-b', credential: 'deployment:key-b', prices },
    },
  };

  const tools = buildImageTools({
    log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    clock,
    imageLongEdge: 1568,
    images,
    providers: options.providers,
    ...(options.drawTimeoutMs === undefined ? {} : { drawTimeoutMs: options.drawTimeoutMs }),
  });

  const registry = buildToolRegistry(tools);

  const budgets: BudgetsContext = {
    log,
    clock,
    zone: 'UTC',
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    builtIn: () =>
      buildBuiltInBudgets(['image.draw'], {
        'image.draw': { dayMicros: 2_000_000, monthMicros: 20_000_000 },
      }),
  };

  const decide: DecisionPoint =
    options.rules === undefined
      ? buildAllowingDecisionPoint()
      : readStarterDecisionPoint((name) => findToolDeclaration(registry, name), {
          extraRules: options.rules,
        });

  const run: ToolRun = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: tools.map((tool) => tool.name),
    model: { model: 'model-a', profile: 'chat-direct' },
    session: {
      key: 'session-a',
      invalidatedThrough: 0,
      reserveImages: (reserved) => {
        const added = reserved.reduce(
          (total, image) => total + Math.ceil(image.bytes.length / 3) * 4,
          0,
        );

        if (spent.count + reserved.length > caps.count || spent.bytes + added > caps.bytes) {
          return false;
        }

        spent.bytes += added;
        spent.count += reserved.length;

        return true;
      },
      readImageRoom: () => ({ bytes: caps.bytes - spent.bytes, count: caps.count - spent.count }),
      holdImageRoom: (key) => {
        if (held.has(key)) {
          return true;
        }

        if (spent.count + 1 > caps.count || spent.bytes + largestImageBytes > caps.bytes) {
          return false;
        }

        spent.bytes += largestImageBytes;
        spent.count += 1;

        held.add(key);

        return true;
      },
      releaseImageRoom: (key) => {
        if (held.delete(key)) {
          spent.bytes -= largestImageBytes;
          spent.count -= 1;
        }
      },
    },
  };

  const toolOptions = {
    registry,
    decide,
    log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    queue: buildStubActionQueue().queue,
    queuedWaitMs: 1000,
    budgets,
  };

  return {
    log,
    budgets,
    run,
    toolOptions,
    clock,
    read: async (tool: string, input: JSONObject) => {
      const reply = await runToolCall({ tool, input, toolUseID: null }, run, toolOptions);

      return readToolResult(reply);
    },
    call: (tool: string, input: JSONObject) =>
      runToolCall({ tool, input, toolUseID: null }, run, toolOptions),
  };
}
