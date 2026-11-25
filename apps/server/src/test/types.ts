// The HTTPS site that a fake Google answers its token, Gmail and every other API request on.
export interface GoogleAPISite {
  readonly url: string;

  // the certificate authority the site signs with
  readonly ca: string;
}
