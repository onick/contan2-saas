// apps/api-v2/src/services/reports/metrics.ts · métricas compartidas de
// reportería. UNA sola definición de "% de ocupación" para el dashboard, los
// Excel, los PDF y el CSV: personas en sala / aforo (las personas incluyen a
// los acompañantes de cada check-in; las reservas sin check-in no cuentan).

/** Porcentaje entero de ocupación; 0 si no hay aforo. */
export function occupancyPct(peopleInRoom: number, capacity: number): number {
  return capacity > 0 ? Math.round((peopleInRoom / capacity) * 100) : 0;
}

/** Personas que ocupan la sala por un check-in: la persona + sus acompañantes. */
export function peopleOf(a: { companionsChildren?: number | null; companionsAdults?: number | null }): number {
  return 1 + (a.companionsChildren || 0) + (a.companionsAdults || 0);
}
