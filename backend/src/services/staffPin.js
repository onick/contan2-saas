import bcrypt from 'bcrypt';

const ROUNDS = 10;
const PIN_REGEX = /^\d{4,8}$/;

export function isValidPinFormat(pin) {
  return typeof pin === 'string' && PIN_REGEX.test(pin);
}

export async function hashPin(pin) {
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN inválido: debe ser 4-8 dígitos');
  }
  return bcrypt.hash(pin, ROUNDS);
}

export async function verifyPin(pin, hash) {
  if (!pin || !hash) return false;
  return bcrypt.compare(pin, hash);
}
