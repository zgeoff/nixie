const fieldPrime = 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n;

const curveB =
  0x5a_c6_35_d8_aa_3a_93_e7_b3_eb_bd_55_76_98_86_bc_65_1d_06_b0_cc_53_b0_f6_3b_ce_3c_3e_27_d2_60_4bn;

export const uncompressedP256PointBytes = 65;

// A WebCrypto import is async, so the check on the curve is plain BigInt math: y² = x³ − 3x + b.
export function isP256Point(bytes: Uint8Array): boolean {
  if (bytes.length !== uncompressedP256PointBytes || bytes[0] !== 0x04) {
    return false;
  }

  const x = toBigInt(bytes.subarray(1, 33));
  const y = toBigInt(bytes.subarray(33, 65));

  if (x >= fieldPrime || y >= fieldPrime) {
    return false;
  }

  const left = (y * y) % fieldPrime;
  const right = (((x * x * x - 3n * x + curveB) % fieldPrime) + fieldPrime) % fieldPrime;

  return left === right;
}

function toBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
}
