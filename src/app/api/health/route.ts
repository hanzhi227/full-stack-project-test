import { NextResponse } from 'next/server';
import { missingConfiguration } from '@/server/config';
export const dynamic = 'force-dynamic';
export function GET() {
 const missing = missingConfiguration();
 return NextResponse.json({ status: missing.length ? 'configuration_required' : 'configured', tracing: process.env.LANGSMITH_API_KEY ? 'configured' : 'disabled', providers: 'not_probed' }, { status: missing.length ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
