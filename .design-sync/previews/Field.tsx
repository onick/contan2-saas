import { Field } from '@contan2/web';

// Campo uncontrolled (defaultValue) con label uppercase y hint opcional.
export const Basico = () => (
  <div className="max-w-sm">
    <Field label="Nombre completo" placeholder="Ana María Rodríguez" />
  </div>
);

export const ConHint = () => (
  <div className="max-w-sm">
    <Field
      label="Correo electrónico"
      type="email"
      defaultValue="ana.rodriguez@ejemplo.do"
      hint="Se usa para enviar la credencial con el código QR."
    />
  </div>
);

// mono: valores tabulares/códigos (font-mono + tabular-nums).
export const Codigo = () => (
  <div className="max-w-sm">
    <Field label="Código de credencial" mono defaultValue="CCB-2026-04871" hint="Código único del asistente." />
  </div>
);
