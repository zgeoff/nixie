// An address that the mail module writes into a header: printable ASCII only, with an ASCII host.
// A domain with non-ASCII letters must come as its punycode form.
export const mailAddressPattern =
  "^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+$";
