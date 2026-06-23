import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'contan2_session';

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) {
    return redirect('/login');
  }

  // Set the session cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || (process.env.NODE_ENV as string) === 'staging',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  return redirect('/app');
}
