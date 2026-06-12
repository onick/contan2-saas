import type { CSSProperties } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { BrandLockup, BrandChip, hasBrandLockup } from '../components/shell/BrandMark';
import { getKioskActivities } from '../lib/api/kiosko';
import type { KioskActivity } from '../lib/kiosko/demoData';
import { getLocalBranding } from '../lib/branding/config';
import { brandingToCssVars } from '../lib/branding/theme';

// Raíz del host del tenant (ccb.contan2.com) · PORTADA PÚBLICA: la marca del
// centro + su cartelera real (mismo slice público del kiosko, tenant por
// host). Reemplaza el índice de andamiaje del primer sprint que quedó
// expuesto tras el cutover. Página COMPARTIBLE: cero enlaces a rutas
// internas del admin (el staff entra por /login directamente). Si el API no
// responde (dev sin api / host sin tenant), muestra la marca sin cartelera —
// jamás actividades de demo en una superficie pública.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const branding = getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;
  const activities = await getKioskActivities();

  return (
    <div style={themeVars} className="min-h-screen bg-page">
      <main className="mx-auto w-full max-w-5xl px-5 py-10 md:py-14">
        {/* Marca del centro */}
        <header className="flex flex-col items-center text-center">
          {hasBrandLockup(branding.slug) ? (
            <BrandLockup slug={branding.slug} name={branding.name} className="w-[230px] max-w-full" />
          ) : (
            <>
              <BrandChip slug={branding.slug} name={branding.name} className="h-14 w-14" />
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink">{branding.name}</h1>
            </>
          )}
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
            Agenda cultural y registro de visitantes del centro.
          </p>
        </header>

        {/* Cartelera real */}
        <section className="mt-10 md:mt-12" aria-label="Próximas actividades">
          <h2 className="text-center text-[13px] font-bold uppercase tracking-[0.14em] text-faint">
            Próximas actividades
          </h2>
          {activities === null ? (
            <p className="mx-auto mt-6 max-w-sm rounded-2xl border border-line bg-surface px-5 py-6 text-center text-[14px] text-muted">
              No pudimos cargar la cartelera en este momento. Volvé a intentar en unos minutos.
            </p>
          ) : activities.length === 0 ? (
            <p className="mx-auto mt-6 max-w-sm rounded-2xl border border-line bg-surface px-5 py-6 text-center text-[14px] text-muted">
              Pronto anunciaremos nuevas actividades. ¡Te esperamos!
            </p>
          ) : (
            <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {activities.map((a) => <ActivityCard key={a.id} a={a} />)}
            </ul>
          )}
        </section>

        <footer className="mt-14 border-t border-line pt-6 text-center text-[12px] text-faint">
          {branding.name} · Plataforma Contan2
        </footer>
      </main>
    </div>
  );
}

function ActivityCard({ a }: { a: KioskActivity }) {
  const cuposLibres = Math.max(0, a.capacity - a.enrolled);
  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      {a.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.imageUrl} alt="" className="h-40 w-full object-cover"
          style={{ objectPosition: `50% ${a.imagePosY ?? 50}%` }} />
      ) : (
        <div aria-hidden="true" className="grid h-40 w-full place-items-center bg-primary-container text-on-primary-container">
          <CalendarDays size={32} strokeWidth={1.5} />
        </div>
      )}
      <div className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{a.category}</p>
        <h3 className="mt-1 text-[15.5px] font-bold leading-snug tracking-tight text-ink">{a.name}</h3>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-1"><CalendarDays size={13} aria-hidden="true" /> {a.date}</span>
          <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden="true" /> {a.location}</span>
        </p>
        <p className="mt-2 text-[12px] font-semibold text-success-fg">
          {cuposLibres > 0 ? `${cuposLibres} cupos disponibles` : 'Cupo lleno'}
        </p>
      </div>
    </li>
  );
}
