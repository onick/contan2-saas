// packages/codes/src/index.ts · contrato de códigos/QR de visitante (paridad v1).
export {
  ALPHABET,
  DEFAULT_PREFIX,
  PREFIX_RE,
  CODE_RE,
  normalizePrefix,
  composeCode,
  generateUserCode,
  isValidCode,
  parseCode,
  normalizeCodeForLookup,
  normalizeScannedCode,
  resolveTenantCode,
  type ParsedCode,
} from './codes.js';

export { qrPayload, type QrUser } from './qr.js';
