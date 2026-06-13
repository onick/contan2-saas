'use client';

// Login email-first desde el marketing (patrón Netflix, pedido del usuario
// 2026-06-12): el staff escribe SU CORREO → buscamos su(s) centro(s) → lo
// mandamos a {slug}.{dominio}/login con el correo pre-llenado. Varios
// centros → elige; ninguno → mensaje neutro con CTA de demo.

import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

export function TenantFinder({ rootDomain }: { rootDomain: string }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [tenants, setTenants] = useState<Array<{ slug: string; name: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loginUrl = (slug: string) =>
    `https://${slug}.${rootDomain}/login?email=${encodeURIComponent(email.trim().toLowerCase())}`;

  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true); setError(null); setTenants(null);
    try {
      const res = await fetch('/login/api/find', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const b = (await res.json().catch(() => null)) as { tenants?: Array<{ slug: string; name: string }>; error?: string } | null;
      if (!res.ok) { setError(b?.error ?? 'No pudimos buscar tu centro. Intentá de nuevo.'); return; }
      const list = b?.tenants ?? [];
      if (list.length === 1 && list[0]) {
        window.location.assign(loginUrl(list[0].slug));
        return;
      }
      setTenants(list);
    } catch {
      setError('Problema de red. Intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <form onSubmit={find} className="flex flex-col gap-3">
        <label htmlFor="finder-email" className="text-[13px] font-semibold text-[#3d4148]">
          Correo de tu cuenta
        </label>
        <input
          id="finder-email" type="email" required autoFocus inputMode="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@institucion.org"
          className="w-full rounded-xl border border-[#e6e3dd] bg-white px-4 py-3 text-[15px] text-[#16181d] placeholder:text-[#9aa0a6] focus:outline-none focus:ring-2 focus:ring-[#e65100]/40"
        />
        <button type="submit" disabled={busy || !email.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#e65100] px-6 py-3 text-[14.5px] font-semibold text-white hover:opacity-95 disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
          Continuar <ArrowRight size={15} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </form>

      {error ? <p role="alert" className="mt-3 text-[13px] text-[#b3261e]">{error}</p> : null}

      {tenants && tenants.length === 0 ? (
        <p className="mt-4 rounded-xl bg-white px-4 py-3 text-[13.5px] leading-relaxed text-[#6b7077]">
          No encontramos una cuenta de equipo con ese correo. Si tu institución aún no usa
          Contan2, <a className="font-semibold text-[#e65100]" href="mailto:soporte@contan2.com?subject=Quiero%20una%20demo%20de%20Contan2">solicitá una demo</a>.
        </p>
      ) : null}

      {tenants && tenants.length > 1 ? (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-[#3d4148]">Estás en varios centros — elegí:</p>
          <ul className="mt-2 overflow-hidden rounded-xl border border-[#e6e3dd] bg-white">
            {tenants.map((t) => (
              <li key={t.slug} className="border-b border-[#e6e3dd] last:border-b-0">
                <a href={loginUrl(t.slug)} className="flex items-center justify-between px-4 py-3 text-[14px] font-medium text-[#16181d] hover:bg-[#faf9f7]">
                  {t.name} <ArrowRight size={14} aria-hidden="true" className="text-[#6b7077]" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
