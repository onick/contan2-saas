'use client';

// Orquestador del kiosko · máquina de estados del flujo del visitante.
// 100% demo: sin API, sin escrituras, sin Resend, sin QR real. La emisión real
// (crear visitante, asistencia, QR/credencial con la misma secuencia que v1 vía
// @contan2/codes, email) vive en el slice público de api-v2 (PR de escrituras).
// No hay shell admin, sidebar ni rutas internas en esta superficie.

import { useEffect, useRef, useState } from 'react';
import {
  WelcomeScreen, ActivityScreen, IdentifyScreen, CodeScreen, NewVisitorScreen, ConfirmationScreen,
  type NewVisitorForm,
} from '../../components/kiosko/screens';
import {
  KIOSK_ACTIVITIES, KIOSK_KNOWN_VISITOR, KIOSK_KNOWN_EMAIL, mintDemoCode,
  type KioskScreen, type KioskActivity, type KioskVisitor,
} from '../../lib/kiosko/demoData';
import { getLocalBranding } from '../../lib/branding/config';

const CONFIRM_SECONDS = 15;

// Lookup demo: reconoce el visitante conocido por código o email; cualquier
// otro dato cuenta como "no encontrado" (en real lo resuelve /public/users).
function demoLookup(query: string): KioskVisitor | null {
  const q = query.trim().toUpperCase();
  if (q === KIOSK_KNOWN_VISITOR.code.toUpperCase()) return KIOSK_KNOWN_VISITOR;
  if (q === KIOSK_KNOWN_EMAIL.toUpperCase()) return KIOSK_KNOWN_VISITOR;
  return null;
}

export default function KioskPage() {
  const brandName = getLocalBranding().name;
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

  const registerNew = (f: NewVisitorForm) => {
    confirmVisitor({
      firstName: f.firstName,
      lastName: f.lastName,
      code: mintDemoCode('CCB'), // prefijo del tenant en real; 'CCB' en demo
      visitCount: 1,
      isNew: true,
      companionsChildren: f.children,
    });
  };

  return (
    <>
      {screen === 'welcome' && (
        <WelcomeScreen brandName={brandName} onStart={() => setScreen('activities')} />
      )}

      {screen === 'activities' && (
        <ActivityScreen
          activities={KIOSK_ACTIVITIES}
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
          onLookup={demoLookup}
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
