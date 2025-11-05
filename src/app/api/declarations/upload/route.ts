import { NextRequest, NextResponse } from 'next/server';

// This entire route is deprecated and replaced by the more generic /api/upload
export async function POST(req: NextRequest) {
    console.warn("DEPRECATED: /api/declarations/upload route was called. This route is no longer in use and will be removed.");
    return NextResponse.json({ error: 'This endpoint is deprecated and no longer available.' }, { status: 410 });
}
