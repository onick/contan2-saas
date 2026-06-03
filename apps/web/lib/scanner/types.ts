// apps/web/lib/scanner/types.ts · tipos compartidos del scanner (sin runtime).
// Vive aparte de lib/api/scanner.ts (server-only) para que el client component
// importe sólo el tipo, sin arrastrar next/headers al bundle del navegador.

// Actividad como la consume el selector del scanner (proyección de PublicActivity).
export interface ScannerActivity {
  id: string;
  name: string;
  location: string;
  dateLabel: string;
  capacity: number;
  enrolledCount: number;
}
