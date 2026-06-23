import { Fraunces } from 'next/font/google';
import { ArrowRight } from 'lucide-react';
import { SignupTrigger } from './SignupTrigger';

// components/marketing/LandingPro.tsx · landing de contan2.com (rediseño
// aprobado 2026-06-12, mockup outputs/mockups/landing-pro.html). Editorial
// premium estilo musesoftware.ai con identidad propia (tinta + naranja
// Contan2) y CAPTURAS REALES del producto. Server Component estático; las
// imágenes viven en public/marketing/. CTAs abren el modal de contacto
// (ContactTrigger → ContactModal → POST /api/contact).

const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'] });

const INK = '#16181d';
const ACCENT = '#e65100';

const MODULES: Array<{
  kicker: string; title: string; body: string; bullets: string[]; shot: string; alt: string; reverse?: boolean;
}> = [
  {
    kicker: 'Kiosko · autoservicio',
    title: 'El visitante se registra solo, en la tablet del lobby.',
    body: 'Elige la actividad, se identifica o se registra en un paso, y recibe su credencial QR permanente por correo. Con sugerencias mientras escribe y manejo de acompañantes.',
    bullets: ['Credencial QR de por vida', 'Niños acompañantes cuentan aforo', 'Pantalla completa, tablet-first'],
    shot: '/marketing/shot-kiosko.png', alt: 'Kiosko de autoregistro de Contan2',
  },
  {
    kicker: 'Check-in · puerta',
    title: 'Consola de puerta en tiempo real para tu staff.',
    body: 'Escaneo QR o búsqueda por nombre, cupos en vivo, walk-ins sin credencial y auditoría de cada ingreso. La fila avanza.',
    bullets: ['Scanner móvil con PIN de equipo', 'Métricas del día en una línea', 'Cada acción queda auditada'],
    shot: '/marketing/shot-checkin.png', alt: 'Consola de check-in de Contan2', reverse: true,
  },
  {
    kicker: 'Audiencia · RSVP',
    title: 'Conoce a tu público y llénale la sala.',
    body: 'Segmentos automáticos por afinidad (fans del cine, habituales, VIPs) e invitaciones por email con confirmación de un clic que aparta el cupo al instante.',
    bullets: ['Segmentos vivos por historial real', 'Email branded con tu identidad', 'Seguimiento: confirmados vs pendientes'],
    shot: '/marketing/shot-email.png', alt: 'Invitación por email branded de Contan2',
  },
];

function Wordmark({ size = 23 }: { size?: number }) {
  return (
    <span className={fraunces.className} style={{ fontWeight: 600, fontSize: size, letterSpacing: '-0.02em', color: INK }}>
      contan<b style={{ color: ACCENT, fontWeight: 600 }}>2</b>
    </span>
  );
}

export function LandingPro() {
  return (
    <div className="min-h-screen bg-[#faf9f7] text-[#16181d] antialiased">
      {/* NAV */}
      <nav className="sticky top-0 z-50 border-b border-[#e6e3dd] bg-[#faf9f7]/90 backdrop-blur">
        <div className="mx-auto flex h-[68px] w-full max-w-[1180px] items-center gap-9 px-6 md:px-8">
          <Wordmark />
          <div className="ml-auto flex items-center gap-3">
            <a href="/login" className="inline-flex items-center rounded-full border border-[#e6e3dd] px-5 py-2.5 text-sm font-semibold text-[#16181d] hover:bg-white">
              Iniciar sesión
            </a>
            <SignupTrigger className="inline-flex items-center gap-2 rounded-full bg-[#16181d] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
              Probar gratis
            </SignupTrigger>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-12 px-6 pb-16 pt-14 md:px-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:pt-20">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#e65100]">Plataforma SaaS · Hecha en RD</p>
          <h1 className={`${fraunces.className} mt-4 text-balance text-[40px] font-medium leading-[1.07] tracking-[-0.015em] md:text-[56px]`}>
            El estándar moderno para la gestión de <em className="text-[#3d4148]">centros culturales</em>.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[16.5px] leading-relaxed text-[#6b7077]">
            El sistema operativo de museos, teatros, fundaciones y centros culturales:
            registro de visitantes, credencial QR permanente, check-in en puerta,
            audiencias segmentadas, protocolo institucional y reportes con tu marca.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <SignupTrigger className="inline-flex items-center gap-2 rounded-full bg-[#e65100] px-6 py-3 text-[14.5px] font-semibold text-white hover:opacity-95">
              Probar gratis 14 días <ArrowRight size={15} strokeWidth={2.25} aria-hidden="true" />
            </SignupTrigger>
            <a href="#modulos" className="inline-flex items-center rounded-full border border-[#e6e3dd] px-6 py-3 text-[14.5px] font-semibold text-[#16181d] hover:bg-white">
              Ver cómo funciona
            </a>
          </div>
          <p className="mt-7 flex items-center gap-2.5 text-[13.5px] text-[#6b7077]">
            <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-[#1da462]" />
            En producción en el <b className="font-semibold text-[#16181d]">Centro Cultural Banreservas</b> · <b className="font-semibold text-[#16181d]">12,000+</b> visitas gestionadas
          </p>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-[14px] border border-[#e6e3dd] bg-white shadow-[0_28px_70px_-28px_rgba(22,24,29,.35)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marketing/shot-dashboard.png" alt="Dashboard de Contan2 con métricas en vivo" className="block w-full" />
          </div>
          <div className="absolute -top-6 right-0 hidden rounded-[14px] border border-[#e6e3dd] bg-white px-4.5 py-3.5 shadow-[0_18px_45px_-18px_rgba(22,24,29,.3)] md:block lg:-right-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6b7077]">Asistencias · 30 días</p>
            <p className={`${fraunces.className} mt-0.5 text-[26px] font-semibold`}>654</p>
            <p className="text-[12px] font-semibold text-[#1da462]">↗ tasa de retorno 70%</p>
          </div>
          <div className="absolute -bottom-7 left-0 hidden rounded-[14px] border border-[#e6e3dd] bg-white px-4.5 py-3.5 shadow-[0_18px_45px_-18px_rgba(22,24,29,.3)] md:block lg:-left-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6b7077]">Check-in en puerta</p>
            <p className={`${fraunces.className} mt-0.5 text-[26px] font-semibold`}>2.1 seg</p>
            <p className="text-[12px] font-semibold text-[#1da462]">QR escaneado → adentro</p>
          </div>
        </div>
      </header>

      {/* TRUST */}
      <section className="border-y border-[#e6e3dd] bg-white">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-6 text-[13.5px] text-[#6b7077] md:gap-x-12">
          <span>Confiado por el <b className="font-semibold text-[#16181d]">Centro Cultural Banreservas</b></span>
          <span aria-hidden="true" className="hidden h-6 w-px bg-[#e6e3dd] md:block" />
          <span><b className="font-semibold text-[#16181d]">1,700+</b> perfiles de audiencia</span>
          <span aria-hidden="true" className="hidden h-6 w-px bg-[#e6e3dd] md:block" />
          <span><b className="font-semibold text-[#16181d]">12,000+</b> visitas registradas</span>
          <span aria-hidden="true" className="hidden h-6 w-px bg-[#e6e3dd] md:block" />
          <span>Multi-tenant · <b className="font-semibold text-[#16181d]">tu marca</b>, tu dominio</span>
        </div>
      </section>

      {/* MÓDULOS */}
      <section id="modulos" className="mx-auto w-full max-w-[1180px] px-6 pb-8 pt-20 md:px-8">
        <div className="max-w-[640px]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#e65100]">Un solo sistema</p>
          <h2 className={`${fraunces.className} mt-3 text-balance text-[30px] font-medium leading-tight tracking-[-0.01em] md:text-[38px]`}>
            Cada puerta del centro, cubierta por un módulo que ya operó un evento real.
          </h2>
          <p className="mt-3.5 text-[15.5px] leading-relaxed text-[#6b7077]">
            Nada de prototipos: cada módulo corre en producción en un centro cultural con eventos semanales.
          </p>
        </div>

        {MODULES.map((m) => (
          <div key={m.kicker} className="grid grid-cols-1 items-center gap-10 border-b border-[#e6e3dd] py-14 last:border-b-0 lg:grid-cols-2 lg:gap-16">
            <div className={m.reverse ? 'lg:order-2' : ''}>
              <p className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-[#e65100]">{m.kicker}</p>
              <h3 className={`${fraunces.className} mt-3 text-[26px] font-medium leading-snug tracking-[-0.01em] md:text-[30px]`}>{m.title}</h3>
              <p className="mt-3.5 max-w-[44ch] text-[15px] leading-[1.7] text-[#6b7077]">{m.body}</p>
              <ul className="mt-4.5 flex flex-col gap-2 text-[14.5px] text-[#3d4148]">
                {m.bullets.map((b) => (
                  <li key={b}><span aria-hidden="true" className="mr-2.5 font-bold text-[#e65100]">—</span>{b}</li>
                ))}
              </ul>
            </div>
            <div className={`overflow-hidden rounded-[14px] border border-[#e6e3dd] bg-white shadow-[0_28px_70px_-28px_rgba(22,24,29,.25)] ${m.reverse ? 'lg:order-1' : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.shot} alt={m.alt} className="block w-full" />
            </div>
          </div>
        ))}
      </section>

      {/* PROTOCOLO · panel oscuro */}
      <div className="mx-auto w-full max-w-[1180px] px-6 md:px-8">
        <section className="my-16 rounded-[28px] bg-[#16181d] px-7 py-14 text-[#f4f2ee] md:px-14 md:py-20">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[.9fr_1.1fr] lg:gap-14">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#f79422]">Protocolo · invitados especiales</p>
              <h2 className={`${fraunces.className} mt-3 text-balance text-[30px] font-medium leading-tight text-white md:text-[38px]`}>
                Recibe a tu embajador como un embajador.
              </h2>
              <p className="mt-4 text-[15.5px] leading-[1.7] text-[#b9bcc2]">
                El único sistema de gestión cultural del mercado con un módulo de protocolo
                institucional: directorio de autoridades, prensa y patrocinadores, invitaciones
                formales con acompañantes autorizados, y banner distintivo en puerta.
              </p>
              <ul className="mt-5 flex flex-col gap-2.5 text-[15px] text-[#d6d3cd]">
                {['Invitación con tratamiento honorífico', 'El «sí» aparta los cupos del grupo completo',
                  'La puerta anuncia: «PROTOCOLO · +2 acompañantes»', 'Cuenta restringida para el departamento'].map((b) => (
                  <li key={b}><span aria-hidden="true" className="mr-2.5 text-[12px] text-[#f79422]">★</span>{b}</li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-[14px] border border-white/10 bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,.7)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/shot-protocolo.png" alt="Directorio de protocolo de Contan2" className="block w-full" />
            </div>
          </div>
        </section>
      </div>

      {/* CTA FINAL */}
      <section className="mx-auto w-full max-w-[1180px] px-6 pb-24 pt-10 text-center md:px-8">
        <h2 className={`${fraunces.className} mx-auto max-w-[680px] text-balance text-[34px] font-medium leading-tight tracking-[-0.01em] md:text-[44px]`}>
          Tu centro cultural conoce a su público.
        </h2>
        <p className="mt-4 text-[15.5px] text-[#6b7077]">
          Registro en segundos, acceso con QR y audiencias listas para comunicar. Sin listas en papel.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
          <SignupTrigger className="inline-flex items-center gap-2 rounded-full bg-[#e65100] px-6 py-3 text-[14.5px] font-semibold text-white hover:opacity-95">
            Crear cuenta gratis <ArrowRight size={15} strokeWidth={2.25} aria-hidden="true" />
          </SignupTrigger>
          <a href="mailto:soporte@contan2.com" className="inline-flex items-center rounded-full border border-[#e6e3dd] px-6 py-3 text-[14.5px] font-semibold text-[#16181d] hover:bg-white">
            Hablar con nosotros
          </a>
        </div>
      </section>

      <footer className="border-t border-[#e6e3dd] py-9 text-[13px] text-[#6b7077]">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 md:px-8">
          <Wordmark size={17} />
          <span>© 2026 Contan2 · Hecho en República Dominicana</span>
          <span>soporte@contan2.com</span>
        </div>
      </footer>
    </div>
  );
}
