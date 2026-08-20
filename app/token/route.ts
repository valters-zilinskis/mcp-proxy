import { NextResponse } from 'next/server';
import { FIXED_TOKEN } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Fake OAuth token endpoint: always issues the fixed proxy token.
export async function POST() {
  return NextResponse.json({
    access_token: FIXED_TOKEN,
    token_type: 'Bearer',
    expires_in: 86400 * 30,
  });
}

