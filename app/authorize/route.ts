import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_REDIRECT_ALLOWLIST } from '@/lib/config';

export const dynamic = 'force-dynamic';

function isAllowedRedirect(redirectUri: string): boolean {
  if (OAUTH_REDIRECT_ALLOWLIST.length === 0) return true;
  return OAUTH_REDIRECT_ALLOWLIST.includes(redirectUri);
}

// Fake OAuth authorization endpoint: redirects back with a code.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state') || '';
  const code = 'authcode-' + Date.now();

  if (!redirectUri) {
    return new NextResponse('Missing redirect_uri', { status: 400 });
  }

  try {
    // Reject malformed values early.
    new URL(redirectUri);
  } catch {
    return new NextResponse('Invalid redirect_uri', { status: 400 });
  }

  if (!isAllowedRedirect(redirectUri)) {
    return new NextResponse('redirect_uri is not allowlisted', { status: 400 });
  }

  const redirect = `${redirectUri}?code=${code}&state=${encodeURIComponent(state)}`;
  return NextResponse.redirect(redirect, 302);
}
