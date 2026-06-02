'use client';

// Máquina de estados del flujo del visitante (extraída del page.tsx, ahora un
// Server Component que le pasa las actividades + el modo). Presentacional +
// estado de flujo; no escribe nada.
//
// MODO (decidido una sola vez en el server, según el fetch de actividades):
//   source='api'  → actividades reales; lookup real vía /kiosko/lookup (proxy).
//   source='demo' → actividades demo;  lookup local (demoLookup).
// No se mezclan: en modo API un lookup con error muestra "intentá de nuevo"
// (no cae a demo). El registro de NUEVO visitante sigue con código demo
// (mintDemoCode) hasta el PR de escrituras; el visitante HALLADO usa su código
// real. La confirmación sigue diciendo que el código/QR definitivo lo emite el
// servidor.

import { useEffect, useRef, useState } from 'react';
import {
  WelcomeScreen, ActivityScreen, IdentifyScreen, CodeScreen, NewVisitorScreen, ConfirmationScreen,
  type NewVisitorForm,
} from '../../components/kiosko/screens';
import {
  KIOSK_KNOWN_VISITOR, KIOSK_KNOWN_EMAIL, mintDemoCode,
  type KioskScreen, type KioskActivity, type KioskVisitor,
} from '../../lib/kiosko/demoData';

const CONFIRM_SECONDS = 15;

export type KioskSource = 'api' | 'demo';

// Lookup DEMO (solo en modo demo): reconoce el visitante demo por código/email.
function demoLookup(query: string): KioskVisitor | null {
  const q = query.trim().toUpperCase();
  if (q === KIOSK_KNOWN_VISITOR.code.toUpperCase()) return KIOSK_KNOWN_VISITOR;
  if (q === KIOSK_KNOWN_EMAIL.toUpperCase()) return KIOSK_KNOWN_VISITOR;
  return null;
}

// Lookup API (modo api): proxy same-origin. El proxy responde 200 con
// { visitor } (hallado) o { visitor: null } (no encontrado); un status no-ok
// (502) = error real → throw (el cliente muestra "intentá de nuevo", no cae a demo).
async function apiLookup(query: string): Promise<KioskVisitor | null> {
  const res = await fetch(`/kiosko/lookup?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`lookup ${res.status}`);
  const data = (await res.json()) as { visitor: KioskVisitor | null };
  return data.visitor;
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

  const reset = useRef(() => {});
  reset.current = () => {
    setScreen('welcome');
    setActivity(null);
    setVisitor(null);
    setCountdown(CONFIRM_SECONDS);
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

  // Lookup según el modo (sin mezclar). En demo se envuelve en Promise para que
  // CodeScreen lo trate igual (async) que el modo API.
  const lookup = source === 'api' ? apiLookup : (q: string) => Promise.resolve(demoLookup(q));

  const registerNew = (f: NewVisitorForm) => {
    confirmVisitor({
      firstName: f.firstName,
      lastName: f.lastName,
      code: mintDemoCode('CCB'), // visitante NUEVO → código demo (sin write todavía)
      visitCount: 1,
      isNew: true,
      companionsChildren: f.children,
    });
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
          onFound={confirmVisitor}
          onNew={() => setScreen('new')}
          onBack={() => setScreen('identify')}
        />
      )}

      {screen === 'new' && (
        <NewVisitorScreen onSubmit={registerNew} onBack={() => setScreen('identify')} />
      )}

      {screen === 'confirmation' && visitor && activity && (
        <ConfirmationScreen
          visitor={visitor}
          activityName={activity.name}
          secondsLeft={countdown}
          onHome={() => reset.current()}
        />
      )}
    </>
  );
}
