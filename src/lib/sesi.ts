import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface DataSesi {
  uid?: number;
  superadminUid?: number;
}

export const opsiSesi: SessionOptions = {
  password: process.env.SESSION_SECRET || '',
  cookieName: 'POSIHRIS',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
  ttl: 60 * 60 * 24 * 14,
};

export async function sesi() {
  if ((opsiSesi.password as string).length < 32) throw new Error('SESSION_SECRET minimal 32 karakter (lihat .env.example)');
  return getIronSession<DataSesi>(await cookies(), opsiSesi);
}
