import { expect, test } from 'bun:test';
import { SignedInPage } from '../components/signed-in-page';
import { featureStore } from '../mocks/feature-store';
import { createDeviceSession } from './create-device-session';
import { FeaturesProbe } from './features-probe';
import { render } from './render';

test('it shows the features that are on once the page has read them', async () => {
  await createDeviceSession();

  await featureStore.featuresOff.create({ feature: 'computer' });

  const rendered = render(
    <SignedInPage onRefresh={() => {}} session="live">
      <FeaturesProbe />
    </SignedInPage>,
  );

  const answered = await rendered.findByText(/^features: /u);

  expect(answered.textContent).not.toInclude('computer');
});
