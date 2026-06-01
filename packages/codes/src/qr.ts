// packages/codes/src/qr.ts
//
// Contrato del payload del QR. CRÍTICO: el QR codifica EXACTAMENTE `user.code`.
// NO una URL, NO un UUID, NO JSON. Paridad con v1:
//  - backend/src/services/credential.js → QRCode.toDataURL(user.code, ...)
//  - frontend/app.js → qrUrl(user.code) → api.qrserver.com?...&data=<code>
// Cambiar esto rompe el escaneo de credenciales existentes.

export interface QrUser {
  code: string;
}

/** El string que debe ir dentro del QR: literalmente el código del visitante. */
export function qrPayload(user: QrUser): string {
  return user.code;
}
