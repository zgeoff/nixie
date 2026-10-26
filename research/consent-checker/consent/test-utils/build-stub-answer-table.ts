export interface StubAnswerTable<Key extends string, Answer> {
  answer: (key: Key) => Answer;
  run: (key: Key) => Promise<Answer>;
}

export function buildStubAnswerTable<Key extends string, Answer>(
  answers: Readonly<Record<Key, Answer>>,
): StubAnswerTable<Key, Answer> {
  const answer = (key: Key): Answer => {
    if (!Object.hasOwn(answers, key)) {
      throw new Error(`the answer table holds no answer for ${key}`);
    }

    return answers[key];
  };

  return { answer, run: (key) => Promise.try(() => answer(key)) };
}
