import { Resend } from 'resend';
import { config } from '../config.js';
import { generateCredentialPng } from './credential.js';

let _resend = null;
function client() {
  if (!_resend && config.RESEND_API_KEY) {
    _resend = new Resend(config.RESEND_API_KEY);
  }
  return _resend;
}

function credentialHtml(user) {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const greeting = user.firstName ? `Hola ${user.firstName}` : 'Hola';
  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f6fa;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#1a237e 0%,#534bae 100%);padding:36px 32px;text-align:center;">
                <div style="font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.7);font-weight:600;margin-bottom:6px;">CENTRO CULTURAL BANRESERVAS</div>
                <div style="color:#ffffff;font-size:22px;font-weight:700;">Tu credencial digital</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 36px 8px;">
                <p style="font-size:18px;font-weight:600;color:#1f2937;margin:0 0 8px;">${escapeHtml(greeting)},</p>
                <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 16px;">¡Bienvenido al Centro Cultural Banreservas! Te entregamos tu credencial personal con tu código único. Guárdala en tu teléfono y muéstrala cuando vengas a una actividad.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 36px;text-align:center;">
                <div style="display:inline-block;background:#1a237e;color:#ffffff;padding:8px 18px;border-radius:8px;font-family:Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:2px;">${escapeHtml(user.code)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 36px 0;text-align:center;">
                <img src="cid:credencial" alt="Credencial CCB" style="max-width:100%;height:auto;border-radius:14px;display:block;margin:0 auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 36px 8px;">
                <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 8px;"><strong>Cómo usarla:</strong></p>
                <ol style="font-size:14px;color:#4b5563;line-height:1.7;padding-left:20px;margin:0 0 8px;">
                  <li>Guarda la imagen adjunta en tu teléfono (toca y mantén → "Guardar imagen").</li>
                  <li>Cuando vengas al centro, abre la imagen.</li>
                  <li>Muestra el código QR al staff en la entrada para hacer check-in.</li>
                </ol>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 36px 32px;">
                <p style="font-size:12px;color:#6b7280;line-height:1.5;margin:0;">Si no solicitaste este registro, puedes ignorar este correo.</p>
              </td>
            </tr>
            <tr>
              <td style="background:#f9fafb;padding:18px 32px;text-align:center;border-top:1px solid #e5e7eb;">
                <p style="font-size:11px;color:#9ca3af;margin:0;letter-spacing:0.5px;">CENTRO CULTURAL BANRESERVAS · Santo Domingo, República Dominicana</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function sendCredentialEmail(user) {
  if (!user.email) {
    return { skipped: true, reason: 'sin email' };
  }
  const pngBuffer = await generateCredentialPng(user);
  const html = credentialHtml(user);
  const subject = `Tu credencial CCB · ${user.code}`;
  const filename = `credencial-${user.code}.png`;

  const c = client();
  if (!c) {
    console.log(`[email-dev] credencial para ${user.email} (${user.code}) lista, ${pngBuffer.length} bytes — falta RESEND_API_KEY para enviar de verdad`);
    return { skipped: true, reason: 'sin RESEND_API_KEY' };
  }

  try {
    const result = await c.emails.send({
      from: config.EMAIL_FROM,
      to: user.email,
      subject,
      html,
      attachments: [
        {
          filename,
          content: pngBuffer,
        },
      ],
    });
    if (result.error) {
      console.error(`[email] error enviando a ${user.email}:`, result.error.message || result.error);
      return { sent: false, error: result.error.message || String(result.error) };
    }
    console.log(`[email] enviado a ${user.email} (id=${result.data?.id || '?'})`);
    return { sent: true, id: result.data?.id };
  } catch (e) {
    console.error(`[email] excepción enviando a ${user.email}:`, e.message);
    return { sent: false, error: e.message };
  }
}
