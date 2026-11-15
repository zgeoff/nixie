import type { ContractInputs } from '@heynixie/contract';

type Assertion = NonNullable<ContractInputs['approvals']['answerProposal']['passkey']>;

type Registration = ContractInputs['passkeys']['register']['response'];

export interface AuthenticatorFlags {
  // the origin the browser reports; the RP ID comes from the options
  readonly origin?: string;
  readonly isUserVerified?: boolean;
  readonly isBackupEligible?: boolean;
  readonly isBackedUp?: boolean;
  readonly counter?: number;
}

interface RegistrationOptions {
  readonly challenge: string;
  readonly rp: { readonly id: string };
}

interface AssertionOptions {
  readonly challenge: string;
  readonly rpId: string;
}

export interface TestAuthenticator {
  readonly credentialID: string;
  readonly register: (
    options: RegistrationOptions,
    flags?: AuthenticatorFlags,
  ) => Promise<Registration>;
  readonly assert: (options: AssertionOptions, flags?: AuthenticatorFlags) => Promise<Assertion>;
}

// A stand-in for a user's authenticator, which signs with ES256 on Web Crypto as a platform
// authenticator does. A flag sets what the real one would report, such as a missing user
// verification.
export async function createTestAuthenticator(): Promise<TestAuthenticator> {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);

  const publicJWK = await crypto.subtle.exportKey('jwk', keys.publicKey);

  const credentialBytes = crypto.getRandomValues(new Uint8Array(16));
  const credentialID = Buffer.from(credentialBytes).toString('base64url');

  return {
    credentialID,
    register: async (options, flags = {}) => {
      const clientDataJSON = buildClientData('webauthn.create', options.challenge, flags.origin);
      const x = Buffer.from(publicJWK.x ?? '', 'base64url');
      const y = Buffer.from(publicJWK.y ?? '', 'base64url');

      const head = await readAuthenticatorHead(options.rp.id, { ...flags, hasCredential: true });

      const authData = Buffer.concat([
        head,
        Buffer.alloc(16),
        buildUint16(credentialBytes.length),
        credentialBytes,
        encodeCOSEKey(x, y),
      ]);

      const attestationObject = encodeCBOR(
        new Map<string, unknown>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]),
      );

      return {
        id: credentialID,
        rawId: credentialID,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientDataJSON.toString('base64url'),
          attestationObject: attestationObject.toString('base64url'),
          transports: ['internal'],
        },
      };
    },
    assert: async (options, flags = {}) => {
      const clientDataJSON = buildClientData('webauthn.get', options.challenge, flags.origin);

      const authData = await readAuthenticatorHead(options.rpId, flags);
      const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(clientDataJSON));

      const clientHash = Buffer.from(digest);

      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.privateKey,
        new Uint8Array(Buffer.concat([authData, clientHash])),
      );

      return {
        id: credentialID,
        rawId: credentialID,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientDataJSON.toString('base64url'),
          authenticatorData: authData.toString('base64url'),
          signature: toDERSignature(new Uint8Array(signature)).toString('base64url'),
        },
      };
    },
  };
}

function buildClientData(type: string, challenge: string, origin: string | undefined): Buffer {
  return Buffer.from(
    JSON.stringify({
      type,
      challenge,
      origin: origin ?? 'https://nixie.example.org',
      crossOrigin: false,
    }),
  );
}

const userPresentFlag = 0x01;
const userVerifiedFlag = 0x04;
const backupEligibleFlag = 0x08;
const backupStateFlag = 0x10;
const attestedFlag = 0x40;

interface HeadFlags extends AuthenticatorFlags {
  readonly hasCredential?: boolean;
}

async function readAuthenticatorHead(rpID: string, flags: HeadFlags): Promise<Buffer> {
  const digest = await crypto.subtle.digest('SHA-256', Buffer.from(rpID));

  const rpIDHash = Buffer.from(digest);

  const bits =
    userPresentFlag |
    ((flags.isUserVerified ?? true) ? userVerifiedFlag : 0) |
    ((flags.isBackupEligible ?? false) || (flags.isBackedUp ?? false) ? backupEligibleFlag : 0) |
    ((flags.isBackedUp ?? false) ? backupStateFlag : 0) |
    (flags.hasCredential === true ? attestedFlag : 0);

  const counter = Buffer.alloc(4);

  counter.writeUInt32BE(flags.counter ?? 0);

  return Buffer.concat([rpIDHash, Buffer.from([bits]), counter]);
}

function buildUint16(value: number): Buffer {
  const bytes = Buffer.alloc(2);

  bytes.writeUInt16BE(value);

  return bytes;
}

function encodeCOSEKey(x: Buffer, y: Buffer): Buffer {
  return encodeCBOR(
    new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, x],
      [-3, y],
    ]),
  );
}

// The few CBOR types an attestation object uses: integers, byte and text strings, and maps.
function encodeCBOR(value: unknown): Buffer {
  if (typeof value === 'number') {
    return value >= 0 ? encodeHead(0, value) : encodeHead(1, -1 - value);
  }

  if (typeof value === 'string') {
    const text = Buffer.from(value);

    return Buffer.concat([encodeHead(3, text.length), text]);
  }

  if (Buffer.isBuffer(value)) {
    return Buffer.concat([encodeHead(2, value.length), value]);
  }

  if (value instanceof Map) {
    const entries = [...value.entries()].flatMap(([key, item]) => [
      encodeCBOR(key),
      encodeCBOR(item),
    ]);

    return Buffer.concat([encodeHead(5, value.size), ...entries]);
  }

  throw new TypeError('the test authenticator encodes no other CBOR type');
}

function encodeHead(majorType: number, length: number): Buffer {
  const major = majorType << 5;

  if (length < 24) {
    return Buffer.from([major | length]);
  }

  if (length < 256) {
    return Buffer.from([major | 24, length]);
  }

  return Buffer.from([major | 25, length >> 8, length & 0xff]);
}

// Web Crypto signs as raw r and s, and WebAuthn verifies a DER sequence of the two integers.
function toDERSignature(raw: Uint8Array): Buffer {
  const half = raw.length / 2;
  const first = toDERInteger(raw.slice(0, half));
  const second = toDERInteger(raw.slice(half));
  const length = first.length + second.length;

  return Buffer.concat([Buffer.from([0x30, length]), first, second]);
}

function toDERInteger(bytes: Uint8Array): Buffer {
  const start = bytes.findIndex((byte) => byte !== 0);
  const trimmed = start === -1 ? Buffer.from([0]) : Buffer.from(bytes.slice(start));
  const lead = (trimmed[0] ?? 0) >= 0x80 ? Buffer.from([0]) : Buffer.alloc(0);
  const body = Buffer.concat([lead, trimmed]);

  return Buffer.concat([Buffer.from([0x02, body.length]), body]);
}
