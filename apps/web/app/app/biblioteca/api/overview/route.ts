// GET overview del Inicio (alertas del acervo + actividad) → api-v2 /biblio/overview.
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(): Promise<Response> { return proxyAuth('GET', '/api/v2/biblio/overview', undefined, true); }
