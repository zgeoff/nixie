export function makeAnswerQueue<Answer>(answers: readonly Answer[]): () => Answer {
  const remaining = [...answers];

  return () => {
    const [next] = remaining.splice(0, 1);

    if (next === undefined) {
      throw new Error(`the answer queue held ${String(answers.length)} answers, and all are used`);
    }

    return next;
  };
}
