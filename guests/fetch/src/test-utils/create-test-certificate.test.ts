import { expect, test } from 'bun:test';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { createTestCertificate } from './create-test-certificate';

test('it creates a certificate for every name, signed by its own key', async () => {
  const certificate = await createTestCertificate(['site.test', 'other.test']);

  const x509 = new X509Certificate(certificate.cert);

  expect(x509.subjectAltName).toBe('DNS:site.test, DNS:other.test');
  expect(x509.checkPrivateKey(createPrivateKey(certificate.key))).toBeTrue();
  expect(x509.verify(x509.publicKey)).toBeTrue();
});
