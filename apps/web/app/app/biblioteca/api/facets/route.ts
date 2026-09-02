// GET facetas del catálogo (tipos + materias con conteos) → api-v2 /biblio/facets.
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(): Promise<Response> { return proxyAuth('GET', '/api/v2/biblio/facets', undefined, true); }
