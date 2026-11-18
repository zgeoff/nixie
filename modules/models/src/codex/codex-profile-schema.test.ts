import { expect, test } from 'bun:test';
import { codexProfileSchema } from './codex-profile-schema';

function setupTest() {
  return {
    buildInput: (overrides: Record<string, unknown> = {}) => ({
      harness: 'codex',
      base_url: 'https://models.example.test',
      credential: 'deployment:codex-main',
      model: 'model-o',
      effort: 'low',
      ...overrides,
    }),
  };
}

test('it reads a profile with no chatgpt_login as an API key profile', () => {
  const ctx = setupTest();
  const result = codexProfileSchema.safeParse(ctx.buildInput());

  expect(result.data?.chatgptLogin).toBeFalse();
});

test.each(['https://chatgpt.com', 'https://chatgpt.com/'])(
  'it reads a plan profile whose base_url is %s',
  (baseURL) => {
    const ctx = setupTest();

    const result = codexProfileSchema.safeParse(
      ctx.buildInput({ base_url: baseURL, chatgpt_login: true }),
    );

    expect(result.data?.chatgptLogin).toBeTrue();
  },
);

test.each([
  'https://models.example.test',
  'https://chatgpt.com/backend-api',
  'http://chatgpt.com',
  'https://chatgpt.com//',
])('it rejects a plan profile whose base_url is %s, and names base_url', (baseURL) => {
  const ctx = setupTest();

  const result = codexProfileSchema.safeParse(
    ctx.buildInput({ base_url: baseURL, chatgpt_login: true }),
  );

  expect(result.error?.issues.map((issue) => issue.path.join('.'))).toStrictEqual(['base_url']);
});

test('it keeps any base_url on a profile that sets chatgpt_login to false', () => {
  const ctx = setupTest();
  const result = codexProfileSchema.safeParse(ctx.buildInput({ chatgpt_login: false }));

  expect(result.data?.baseURL).toBe('https://models.example.test');
});
