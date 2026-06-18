'use client';

// Máquina de estados del flujo del visitante (extraída del page.tsx, ahora un
// Server Component que le pasa las actividades + el modo).
//
// MODO (decidido una sola vez en el server, según el fetch de actividades):
//   source='api'  → actividades reales; lookup real (/kiosko/lookup) y
//                   CHECK-IN REAL al confirmar (/kiosko/checkin → POST público).
//                   La confirmación devuelve el CÓDIGO REAL del visitante.
//   source='demo' → actividades demo; lookup local; confirmación presentacional
//                   (nuevo → código demo mintDemoCode; hallado → su código demo).
// No se mezclan. En modo API, el confirmar (hallado o nuevo) escribe de verdad:
// éxito → pantalla de confirmación con el código real; fallo (cupo agotado,
// correo ya registrado, duplicado, red) → pantalla de error con reintento.

import { useEffect, useRef, useState } from 'react';
import {
  WelcomeScreen, ActivityScreen, IdentifyScreen, CodeScreen, NewVisitorScreen,
  ConfirmationScreen, CheckinErrorScreen, type NewVisitorForm,
} from '../../components/kiosko/screens';
import {
  KIOSK_KNOWN_VISITOR, KIOSK_KNOWN_EMAIL, mintDemoCode,
  type KioskScreen, type KioskActivity, type KioskVisitor,
} from '../../lib/kiosko/demoData';
import { checkinErrorMessage, type KioskCheckinResult } from '../../lib/kiosko/checkin';
import type { ActivityAudience } from '@contan2/contracts';

const CONFIRM_SECONDS = 15;

export type KioskSource = 'api' | 'demo';

// Lookup DEMO (solo en modo demo): reconoce el visitante demo por código/email.
function demoLookup(query: string): KioskVisitor | null {
  const q = query.trim().toUpperCase();
  if (q === KIOSK_KNOWN_VISITOR.code.toUpperCase()) return KIOSK_KNOWN_VISITOR;
  if (q === KIOSK_KNOWN_EMAIL.toUpperCase()) return KIOSK_KNOWN_VISITOR;
  return null;
}

// Lookup API (modo api): proxy same-origin. 200 { visitor } (hallado) o
// { visitor: null } (no encontrado); { matches } (homónimos por nombre, 2..5);
// { needsFullName, hint } (entrada incompleta: falta apellido — la UI guía sin
// ofrecer registro nuevo); status no-ok (502) = error → throw.
export type LookupOutcome =
  | { visitor: KioskVisitor }
  | { matches: KioskVisitor[] }
  | { needsFullName: true; hint: string }
  | null;
async function apiLookup(query: string): Promise<LookupOutcome> {
  const res = await fetch(`/kiosko/lookup?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`lookup ${res.status}`);
  const data = (await res.json()) as { visitor: KioskVisitor | null; matches?: KioskVisitor[]; needsFullName?: boolean; hint?: string };
  if (data.matches?.length) return { matches: data.matches };
  if (data.needsFullName) return { needsFullName: true, hint: data.hint ?? 'Escribe tu nombre y apellido.' };
  return data.visitor ? { visitor: data.visitor } : null;
}

// Cuerpo del check-in público: el visitante se identifica por código (hallado) o
// se registra como nuevo. Un solo adulto por check-in; sólo niños acompañantes.
type CheckinVisitor =
  | { code: string }
  | { new: { firstName: string; lastName: string; email?: string; phone?: string } };

// POST real al proxy del check-in. Devuelve un resultado discriminado (sin throw).
async function postCheckin(
  activityId: string,
  visitor: CheckinVisitor,
  companions: number,
  audience: ActivityAudience,
): Promise<{ ok: true; data: KioskCheckinResult } | { ok: false; message: string }> {
  // El TIPO DE PÚBLICO de la actividad decide si los acompañantes son niños
  // (infantil) o adultos (default). Uno de los dos viaja; el otro queda en 0.
  const infantil = audience === 'infantil';
  try {
    const res = await fetch('/kiosko/checkin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        activityId,
        visitor,
        companionsChildren: infantil ? companions : 0,
        companionsAdults: infantil ? 0 : companions,
      }),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* respuesta sin JSON → cae a error genérico */
    }
    if (res.ok) return { ok: true, data: body as KioskCheckinResult };
    return { ok: false, message: checkinErrorMessage(res.status, body) };
  } catch {
    return { ok: false, message: checkinErrorMessage(0, null) };
  }
}

export function KioskClient({
  activities, source, brandName, logoUrl,
}: {
  activities: KioskActivity[];
  source: KioskSource;
  brandName: string;
  logoUrl: string | null;
}) {
  const [screen, setScreen] = useState<KioskScreen>('welcome');
  const [activity, setActivity] = useState<KioskActivity | null>(null);
  const [visitor, setVisitor] = useState<KioskVisitor | null>(null);
  const [countdown, setCountdown] = useState(CONFIRM_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = useRef(() => {});
  reset.current = () => {
    setScreen('welcome');
    setActivity(null);
    setVisitor(null);
    setCountdown(CONFIRM_SECONDS);
    setErrorMsg(null);
  };

  // Autoretorno al inicio desde la confirmación (como el kiosko v1).
  useEffect(() => {
    if (screen !== 'confirmation') return;
    setCountdown(CONFIRM_SECONDS);
    const tick = setInterval(() => {
      setCountdown((s) => {
        if (s <= 1) { clearInterval(tick); reset.current(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [screen]);

  const confirmVisitor = (v: KioskVisitor) => { setVisitor(v); setScreen('confirmation'); };

  // Lookup según el modo (sin mezclar). En demo se envuelve en Promise.
  const lookup = source === 'api' ? apiLookup : (q: string) => { const v = demoLookup(q); return Promise.resolve(v ? { visitor: v } : null); };

  // Confirmar VISITANTE HALLADO. Demo → presentacional. API → check-in real {code}.
  const confirmFound = async (found: KioskVisitor) => {
    if (source !== 'api') { confirmVisitor(found); return; }
    if (!activity || submitting) return;
    setSubmitting(true);
    const r = await postCheckin(activity.id, { code: found.code }, found.companionsChildren, activity.audience ?? 'adultos');
    setSubmitting(false);
    if (r.ok) {
      // Código real (el mismo que ya tenía) + conteo de visitas actualizado.
      confirmVisitor({ ...found, code: r.data.code, visitCount: r.data.visitCount });
    } else {
      setErrorMsg(r.message); setScreen('error');
    }
  };

  // Registrar VISITANTE NUEVO. Demo → código demo. API → check-in real {new} →
  // código REAL devuelto por el servidor.
  const registerNew = async (f: NewVisitorForm) => {
    if (source !== 'api') {
      confirmVisitor({
        firstName: f.firstName, lastName: f.lastName,
        code: mintDemoCode('CCB'), visitCount: 1, isNew: true, companionsChildren: f.children,
      });
      return;
    }
    if (!activity || submitting) return;
    setSubmitting(true);
    const newVisitor = {
      firstName: f.firstName, lastName: f.lastName,
      ...(f.email ? { email: f.email } : {}),
      ...(f.phone ? { phone: f.phone } : {}),
    };
    const r = await postCheckin(activity.id, { new: newVisitor }, f.children, activity.audience ?? 'adultos');
    setSubmitting(false);
    if (r.ok) {
      confirmVisitor({
        firstName: f.firstName, lastName: f.lastName,
        code: r.data.code, visitCount: r.data.visitCount, isNew: true, companionsChildren: f.children,
      });
    } else {
      setErrorMsg(r.message); setScreen('error');
    }
  };

  return (
    <>
      {screen === 'welcome' && (
        <WelcomeScreen brandName={brandName} logoUrl={logoUrl} onStart={() => setScreen('activities')} />
      )}

      {screen === 'activities' && (
        <ActivityScreen
          activities={activities}
          onSelect={(a) => { setActivity(a); setScreen('identify'); }}
          onHome={() => reset.current()}
        />
      )}

      {screen === 'identify' && activity && (
        <IdentifyScreen
          activityName={activity.name}
          onHasCode={() => setScreen('code')}
          onNew={() => setScreen('new')}
          onBack={() => setScreen('activities')}
        />
      )}

      {screen === 'code' && (
        <CodeScreen
          onLookup={lookup}
          onFound={confirmFound}
          submitting={submitting}
          onNew={() => setScreen('new')}
          onBack={() => setScreen('identify')}
          audience={activity?.audience ?? 'adultos'}
        />
      )}

      {screen === 'new' && (
        <NewVisitorScreen onSubmit={registerNew} submitting={submitting} onBack={() => setScreen('identify')} audience={activity?.audience ?? 'adultos'} />
      )}

      {screen === 'confirmation' && visitor && activity && (
        <ConfirmationScreen
          visitor={visitor}
          activityName={activity.name}
          real={source === 'api'}
          secondsLeft={countdown}
          onHome={() => reset.current()}
          audience={activity.audience ?? 'adultos'}
        />
      )}

      {screen === 'error' && (
        <CheckinErrorScreen
          message={errorMsg ?? 'No pudimos completar el registro.'}
          onRetry={() => { setErrorMsg(null); setScreen('identify'); }}
          onHome={() => reset.current()}
        />
      )}
    </>
  );
}
