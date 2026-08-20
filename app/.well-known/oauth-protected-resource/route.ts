import { NextResponse } from 'next/server';
import { PUBLIC_URL } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Shared OAuth metadata: tells clients where to authenticate.
export async function GET() {
  return NextResponse.json({
    resource: PUBLIC_URL,
    authorization_servers: [PUBLIC_URL],
    bearer_methods_supported: ['header'],
  });
}

