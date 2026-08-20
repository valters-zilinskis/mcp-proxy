import { NextResponse } from 'next/server';
import { PUBLIC_URL } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Shared OAuth metadata: fake authorization server configuration.
export async function GET() {
  return NextResponse.json({
    issuer: PUBLIC_URL,
    authorization_endpoint: `${PUBLIC_URL}/authorize`,
    token_endpoint: `${PUBLIC_URL}/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
  });
}

