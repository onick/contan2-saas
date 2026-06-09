import { proxyCheckinActivities } from '../../../../../lib/api/checkin-proxy';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> { return proxyCheckinActivities(); }
