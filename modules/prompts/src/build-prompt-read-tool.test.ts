import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildPromptReadTool } from './build-prompt-read-tool';
import { compactionPrompt } from './compaction-prompt';

test("it returns each part's built-in text and paths, and the default template, with no definitions in force", async () => {
  const instruction = compactionPrompt.parts['instruction'];
  const safety = compactionPrompt.parts['safety'];

  invariant(instruction && safety);

  const tool = buildPromptReadTool({ readInForce: () => null });

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'prompt_read', input: { id: 'compaction' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      id: 'compaction',
      parts: [
        {
          name: 'instruction',
          text: instruction.text,
          paths: ['owner.name', 'owner.nameAtSentenceStart', 'summary.words'],
          override: null,
        },
        {
          name: 'safety',
          text: safety.text,
          paths: ['owner.name', 'owner.nameAtSentenceStart', 'summary.words', 'parts.instruction'],
          override: null,
        },
      ],
      template: {
        text: '{{ parts.instruction }}\n{{ parts.safety }}',
        paths: [
          'owner.name',
          'owner.nameAtSentenceStart',
          'summary.words',
          'parts.instruction',
          'parts.safety',
        ],
        override: null,
      },
    },
  });
});

test('it returns the part and the template that the definitions in force override', async () => {
  const instruction = compactionPrompt.parts['instruction'];
  const safety = compactionPrompt.parts['safety'];

  invariant(instruction && safety);

  const tool = buildPromptReadTool({
    readInForce: () => ({
      prompts: {
        compaction: {
          parts: { safety: 'Answer with the summary alone.' },
          template: '{{ parts.safety }}\n{{ parts.instruction }}',
        },
      },
    }),
  });

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'prompt_read', input: { id: 'compaction' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      id: 'compaction',
      parts: [
        {
          name: 'instruction',
          text: instruction.text,
          paths: ['owner.name', 'owner.nameAtSentenceStart', 'summary.words'],
          override: null,
        },
        {
          name: 'safety',
          text: safety.text,
          paths: ['owner.name', 'owner.nameAtSentenceStart', 'summary.words', 'parts.instruction'],
          override: 'Answer with the summary alone.',
        },
      ],
      template: {
        text: '{{ parts.instruction }}\n{{ parts.safety }}',
        paths: [
          'owner.name',
          'owner.nameAtSentenceStart',
          'summary.words',
          'parts.instruction',
          'parts.safety',
        ],
        override: '{{ parts.safety }}\n{{ parts.instruction }}',
      },
    },
  });
});

test('it returns no override for a prompt that the definitions in force leave alone', async () => {
  const instruction = compactionPrompt.parts['instruction'];
  const safety = compactionPrompt.parts['safety'];

  invariant(instruction && safety);

  const tool = buildPromptReadTool({
    readInForce: () => ({
      prompts: { writer: { parts: { safety: 'Quote every fact.' }, template: null } },
    }),
  });

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'prompt_read', input: { id: 'compaction' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      id: 'compaction',
      parts: [
        {
          name: 'instruction',
          text: instruction.text,
          paths: ['owner.name', 'owner.nameAtSentenceStart', 'summary.words'],
          override: null,
        },
        {
          name: 'safety',
          text: safety.text,
          paths: ['owner.name', 'owner.nameAtSentenceStart', 'summary.words', 'parts.instruction'],
          override: null,
        },
      ],
      template: {
        text: '{{ parts.instruction }}\n{{ parts.safety }}',
        paths: [
          'owner.name',
          'owner.nameAtSentenceStart',
          'summary.words',
          'parts.instruction',
          'parts.safety',
        ],
        override: null,
      },
    },
  });
});
