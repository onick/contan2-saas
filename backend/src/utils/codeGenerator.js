import { randomBytes } from 'crypto';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateUserCode() {
  const ts2 = Date.now().toString(36).toUpperCase().slice(-2);
  const bytes = randomBytes(4);
  let rand = '';
  for (let i = 0; i < 4; i++) rand += ALPHABET[bytes[i] % 36];
  return `CCB-${ts2}${rand}`;
}
