import { mailAddressPattern } from './mail-address-pattern';

const addressExpression = new RegExp(mailAddressPattern, 'u');

export function isMailAddress(value: string): boolean {
  return addressExpression.test(value);
}
