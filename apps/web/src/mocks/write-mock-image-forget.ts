import { mockViewStore } from './mock-view-store';

interface ImageForgetInput {
  readonly clientActionID: string;
  readonly image: string;
}

type ImageForgetResult =
  | { readonly status: 'forgotten'; readonly forgottenAt: Date }
  | { readonly status: 'not_found' }
  | { readonly status: 'reused' };

export async function writeMockImageForget(input: ImageForgetInput): Promise<ImageForgetResult> {
  const earlier = mockViewStore.imageForgets.findFirst((query) =>
    query.where({ clientActionID: input.clientActionID }),
  );

  if (earlier !== undefined) {
    return earlier.image === input.image
      ? { status: 'forgotten', forgottenAt: earlier.forgottenAt }
      : { status: 'reused' };
  }

  const target = mockViewStore.images.findFirst((query) =>
    query.where((row) => row.image === input.image),
  );

  if (target === undefined) {
    return { status: 'not_found' };
  }

  const forgottenAt = new Date();

  await mockViewStore.images.update(target, {
    data(draft) {
      draft.isForgotten = true;
      draft.name = null;
      draft.prompt = null;
    },
  });

  await mockViewStore.imageForgets.create({ ...input, forgottenAt });

  return { status: 'forgotten', forgottenAt };
}
