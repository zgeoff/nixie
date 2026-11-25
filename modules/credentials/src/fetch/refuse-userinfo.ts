import { CredentialRefusalError } from '@heynixie/egress';

// A Request refuses a URL with userinfo in a TypeError of its own, so the text is checked first.
export function refuseUserinfo(text: string, subject: string): void {
  const url = URL.parse(text);

  if (url !== null && (url.username !== '' || url.password !== '')) {
    throw new CredentialRefusalError(`${subject} holds a user name or a password`);
  }
}
