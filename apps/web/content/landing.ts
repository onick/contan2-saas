// apps/web/content/landing.ts · copy FINAL de la landing de contan2.com
// (mockup aprobado 2026-10-16). Español neutro con TÚ. "CCB" / "Centro Cultural
// Banreservas" solo aparecen en `proof`. Cada cifra lleva `source` y `asOf`.
// El correo de contacto (a confirmar por el owner) se cambia solo en CONTACT_EMAIL.

import heroReportes from './landing/media/hero-reportes.png';
import heroReportesMobile from './landing/media/hero-reportes-mobile.png';
import kiosko from './landing/media/kiosko.png';
import puerta from './landing/media/puerta.png';
import audiencias from './landing/media/audiencias.png';
import protocolo from './landing/media/protocolo.png';
import reportes from './landing/media/reportes.png';
import identidad from './landing/media/identidad.png';
import type { LandingContent, LandingImage } from './landing.types';

export const CONTACT_EMAIL = 'soporte@contan2.com';

const STAGING = { origin: 'staging-ccb', capturedAt: '2026-10-16', redacted: true } as const;
const shot = (img: Pick<LandingImage, 'src' | 'alt'> & Partial<LandingImage>): LandingImage => ({
  ...STAGING,
  ...img,
});

const PROOF_SOURCE =
  'Base de datos de producción de contan2 · tenant Centro Cultural Banreservas · conteo de asistencias con hora de entrada / personas no archivadas / actividades realizadas';

export const landing: LandingContent = {
  seo: {
    title: 'contan2 · Registro de visitantes para centros culturales',
    description:
      'Registro de visitantes, acceso con credencial QR, invitaciones y reportes de asistencia para centros culturales, museos y salas, con tu identidad.',
    canonical: 'https://contan2.com/',
    ogImage: {
      url: 'https://contan2.com/marketing/og.png',
      width: 1200,
      height: 630,
      alt: 'contan2: registro de visitantes, acceso y reportes para centros culturales.',
    },
  },
  nav: {
    links: [
      { label: 'Producto', href: '#producto' },
      { label: 'Cómo funciona', href: '#como-funciona' },
      { label: 'Clientes', href: '#clientes' },
      { label: 'Preguntas', href: '#preguntas' },
    ],
    login: { label: 'Iniciar sesión', href: '/login', variant: 'ghost' },
    primary: { label: 'Solicitar una demo', href: '#contacto', variant: 'primary' },
  },
  hero: {
    eyebrow: '',
    title: 'Conoce a cada persona que cruza tu puerta.',
    subtitle:
      'Registro de visitantes, acceso con credencial QR y reportes de asistencia para centros culturales, museos y salas, con la identidad de tu institución.',
    ctas: [
      { label: 'Solicitar una demo', href: '#contacto', variant: 'primary' },
      { label: 'Iniciar sesión', href: '/login', variant: 'secondary' },
    ],
    image: shot({
      src: heroReportes,
      mobileSrc: heroReportesMobile,
      alt: 'Panel de reportes de contan2 con asistencias del año, distribución por tipo de actividad y evolución diaria.',
    }),
  },
  proof: {
    client: {
      name: 'Centro Cultural Banreservas',
      permissionRef: 'pendiente · permiso escrito del CCB/Banreservas solicitado 2026-10-16',
    },
    location: 'Santo Domingo',
    statement:
      'Desde mayo de 2026, el {client} registra en contan2 cada entrada a su programación: {m0} asistencias a {m1} actividades y un padrón de {m2} personas.',
    metrics: [
      {
        value: '3,557',
        label: 'asistencias registradas',
        source: PROOF_SOURCE,
        asOf: '2026-10-16',
      },
      {
        value: '63',
        label: 'actividades realizadas',
        source: PROOF_SOURCE,
        asOf: '2026-10-16',
      },
      {
        value: '2,837',
        label: 'personas en el padrón',
        source: PROOF_SOURCE,
        asOf: '2026-10-16',
      },
    ],
    sourceNote:
      'base de datos de producción de contan2 del Centro Cultural Banreservas; asistencias con hora de entrada, personas no archivadas y actividades realizadas.',
    note: 'En operación diaria en el kiosko, la puerta y las salas permanentes del centro.',
  },
  problem: {
    heading: 'Lo que hoy depende de listas en papel y hojas de cálculo.',
    labels: { before: 'Hoy', after: 'Con contan2' },
    rows: [
      {
        before: 'Las asistencias se anotan en listas que después alguien transcribe, si se transcriben.',
        after:
          'Cada entrada se registra al momento, con su actividad, la hora y los acompañantes, y el equipo la ve en vivo.',
      },
      {
        before: 'No hay una forma sencilla de saber quién viene por primera vez y quién regresa.',
        after:
          'Cada visitante tiene una credencial QR permanente, y el sistema distingue a quien llega por primera vez de quien vuelve.',
      },
      {
        before: 'Armar el informe del mes exige contar a mano y copiar datos entre hojas.',
        after: 'El reporte mensual sale con las columnas del registro de tu departamento, en Excel o en PDF con tu marca.',
      },
    ],
  },
  modules: {
    heading: 'Seis módulos sobre un mismo padrón de visitantes.',
    intro:
      'La persona que se registra en el kiosko es la misma que entra por la puerta, recibe tus invitaciones y aparece en el reporte de fin de mes.',
    items: [
      {
        id: 'kiosko',
        kicker: 'Kiosko de autoregistro',
        title: 'El visitante se registra solo, en la tablet de la entrada.',
        body: 'Elige la actividad, escribe su nombre, correo o teléfono y el sistema lo reconoce. Si es su primera visita, se registra en un paso y recibe su credencial QR por correo.',
        bullets: [
          'Sugerencias mientras escribe',
          'Acompañantes niños o adultos, según la actividad',
          'Diseñado para tablet, en pantalla completa',
        ],
        image: shot({
          src: kiosko,
          alt: 'Kiosko de contan2 en tablet: reloj grande y botón «Toca para registrarte» con la marca del centro.',
        }),
      },
      {
        id: 'puerta',
        kicker: 'Puerta y escáner',
        title: 'Tu equipo da entrada desde el celular o desde la consola.',
        body: 'El escáner lee la credencial QR desde cualquier celular con cámara. La consola de check-in busca por código, nombre, correo o teléfono y registra acompañantes o entradas sin credencial.',
        bullets: [
          'Acceso al escáner con PIN de puerta',
          'Entradas del día y aforo en vivo',
          'Salas permanentes con su propio registro',
        ],
        image: shot({
          src: puerta,
          alt: 'Consola de check-in con resultados de búsqueda difuminados y, al lado, el escáner móvil pidiendo el PIN de puerta.',
        }),
      },
      {
        id: 'audiencias',
        kicker: 'Audiencias e invitaciones',
        title: 'Sabes quién es tu público y lo invitas por segmento.',
        body: 'Los segmentos se calculan a partir del historial real de asistencias: nuevos, recurrentes, interesados en un ciclo. Envía la invitación con tu marca y quien confirma tiene su lugar apartado.',
        bullets: [
          'Segmentos por afinidad y frecuencia',
          'Confirmación con un clic desde el correo',
          'Seguimiento de confirmados y pendientes',
        ],
        image: shot({
          src: audiencias,
          alt: 'Panel de segmentos con 1,333 visitantes activos y, encima, el correo de invitación con los botones «Sí, voy» y «No puedo».',
        }),
      },
      {
        id: 'protocolo',
        kicker: 'Protocolo',
        title: 'Invitados especiales, con el trato que corresponde.',
        body: 'Un directorio de autoridades, cuerpo diplomático, prensa y patrocinadores, con invitaciones formales, acompañantes autorizados y aviso en la puerta cuando llegan.',
        bullets: [
          'La confirmación aparta los cupos de todo el grupo',
          'Aviso de protocolo en la consola de puerta',
          'Acceso limitado para el departamento de protocolo',
        ],
        image: shot({
          src: protocolo,
          alt: 'Directorio de protocolo con indicadores de invitados y tarjetas de invitados con los datos personales difuminados.',
        }),
      },
      {
        id: 'reportes',
        kicker: 'Reportes',
        title: 'El informe del mes, en el formato de tu departamento.',
        body: 'Un resumen ejecutivo comparado con el período anterior y descargas en Excel o PDF con tu identidad. El reporte mensual reproduce las columnas del registro que ya usa tu equipo.',
        bullets: [
          'Asistencias por tipo de actividad, hora y día',
          'Reporte por ciclo o por categoría',
          'Asistente que arma el reporte a partir de una pregunta en español',
        ],
        image: shot({
          src: reportes,
          alt: 'Reporte de actividades más concurridas y asistencias por hora, junto a la primera página del informe de período en PDF.',
        }),
      },
      {
        id: 'identidad',
        kicker: 'Identidad de tu institución',
        title: 'Tu marca en cada pantalla, no la nuestra.',
        body: 'Sube tu logo y elige tus colores: el sistema los aplica al panel, al kiosko, a los correos y a la credencial. Si una combinación no alcanza el contraste mínimo, te lo advierte antes de guardar.',
        bullets: ['Logo horizontal y vertical', 'Tu subdominio o tu propio dominio', 'Verificación de contraste WCAG AA'],
        image: shot({
          src: identidad,
          alt: 'Pantalla de identidad: nombre visible, logo horizontal y vista previa con aviso de contraste insuficiente.',
        }),
      },
    ],
  },
  steps: {
    heading: 'Cómo empezamos a trabajar contigo.',
    items: [
      {
        title: 'Conversamos sobre tu centro',
        body: 'Nos cuentas cómo funcionan tus salas, tu programación y tus informes, y te mostramos el sistema con esos casos.',
      },
      {
        title: 'Configuramos tu espacio',
        body: 'Creamos tu organización con tu logo, colores y dominio, cargamos tus actividades e importamos tu padrón si ya tienes uno.',
      },
      {
        title: 'Abres la puerta',
        body: 'Tu equipo usa el kiosko, el escáner y el panel desde el primer evento, y te acompañamos durante la puesta en marcha.',
      },
    ],
  },
  trust: {
    heading: 'Los datos de tu público, protegidos y bajo tu control.',
    note: 'Lo que aparece aquí está en funcionamiento hoy. Si tu institución necesita un acuerdo de tratamiento de datos, lo revisamos contigo.',
    items: [
      {
        icon: 'lock',
        title: 'Aislamiento por organización',
        body: 'Cada institución ve solo sus datos. La separación se aplica en la propia base de datos, con seguridad a nivel de fila, además de en la aplicación.',
      },
      {
        icon: 'database',
        title: 'Copias de seguridad diarias',
        body: 'La base de datos se respalda cada día desde el 13 de octubre de 2026 y se conservan las últimas 14 copias.',
      },
      {
        icon: 'qr',
        title: 'Credenciales que no caducan',
        body: 'Los códigos QR ya entregados siguen funcionando: nunca se regeneran, aunque cambie la plataforma.',
      },
      {
        icon: 'user-check',
        title: 'Acceso por rol',
        body: 'Dirección, puerta, protocolo y salas tienen roles separados, y cada acción relevante queda en el historial.',
      },
    ],
  },
  faq: {
    heading: 'Preguntas frecuentes',
    aside: { before: '¿No encuentras tu pregunta?', linkLabel: 'Escríbenos', after: 'y te respondemos.' },
    items: [
      {
        q: '¿Necesito instalar algo?',
        a: 'No. contan2 funciona en el navegador: el panel en una computadora, el kiosko en una tablet y el escáner en cualquier celular con cámara.',
      },
      {
        q: '¿Puedo traer la base de visitantes que ya tengo?',
        a: 'Sí. Durante la configuración importamos tu padrón desde Excel o CSV y revisamos contigo los registros duplicados antes de activarlo.',
      },
      {
        q: '¿Funciona con salas permanentes además de la programación?',
        a: 'Sí. Las salas permanentes tienen su propio registro de entradas, su agenda de visitas en grupo y sus estadísticas, separadas de las actividades con fecha.',
      },
      {
        q: '¿Quién puede ver los datos de los visitantes?',
        a: 'Solo el personal de tu organización con un rol que lo permita. Ninguna otra institución que use contan2 puede ver tus datos.',
      },
      {
        q: '¿Se puede usar con nuestra marca y nuestro dominio?',
        a: 'Sí. El panel, el kiosko, los correos y la credencial usan tu logo y tus colores, y puedes conectar un dominio propio.',
      },
      {
        q: '¿Cuánto cuesta?',
        a: 'Depende del tamaño de tu institución y de los módulos que uses. Solicita una demo y te enviamos una propuesta.',
      },
    ],
  },
  contact: {
    heading: 'Veamos cómo funcionaría en tu centro.',
    body: 'Cuéntanos sobre tu institución y te escribimos para agendar una demostración con tus propios casos.',
    successTitle: 'Recibimos tu solicitud',
    successBody: 'Te escribiremos pronto para agendar la demostración.',
    errorBody: 'No pudimos enviar tu mensaje. Inténtalo de nuevo o escríbenos por correo.',
    fallbackEmail: CONTACT_EMAIL,
  },
  footer: {
    legal: '© 2026 contan2',
    email: CONTACT_EMAIL,
    tagline: 'Registro de visitantes, acceso y reportes para centros culturales.',
    origin: 'Hecho en República Dominicana',
    links: [
      { label: 'Iniciar sesión', href: '/login' },
      { label: 'Solicitar una demo', href: '#contacto' },
    ],
    groups: [
      {
        title: 'Producto',
        links: [
          { label: 'Módulos', href: '#producto' },
          { label: 'Cómo funciona', href: '#como-funciona' },
          { label: 'Preguntas', href: '#preguntas' },
        ],
      },
      {
        title: 'Cuenta',
        links: [
          { label: 'Iniciar sesión', href: '/login' },
          { label: 'Solicitar una demo', href: '#contacto' },
          { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
        ],
      },
      {
        title: 'Legal',
        links: [
          { label: 'Privacidad', note: '(disponibles próximamente)' },
          { label: 'Términos', note: '(disponibles próximamente)' },
        ],
      },
    ],
  },
};
