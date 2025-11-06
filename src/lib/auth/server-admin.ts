import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';

/**
 * Server-side admin role validation helper
 * 
 * Validates that the request is made by an authenticated user with admin role.
 * 
 * @param req - Next.js request object
 * @returns 
 *   - If valid: { valid: true, userId: string, adminClient: SupabaseClient }
 *   - If invalid: { valid: false, response: NextResponse } (ready to return)
 */
export async function validateAdminRequest(req: NextRequest): Promise<
  | { valid: true; userId: string; adminClient: ReturnType<typeof getAdminClient> }
  | { valid: false; response: NextResponse }
> {
  const adminClient = getAdminClient();

  // Extract token from Authorization header
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
    return {
      valid: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Missing authentication token' },
        { status: 401 }
      ),
    };
  }

  // Validate token and get user
  const { data: authUser, error: authError } = await adminClient.auth.getUser(token);
  
  if (authError || !authUser?.user) {
    return {
      valid: false,
      response: NextResponse.json(
        { error: 'Unauthorized: Invalid or expired token' },
        { status: 401 }
      ),
    };
  }

  const userId = authUser.user.id;

  // Check if user has admin role
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    return {
      valid: false,
      response: NextResponse.json(
        { error: 'Internal server error: Failed to verify role' },
        { status: 500 }
      ),
    };
  }

  if (!profile || profile.role !== 'admin') {
    return {
      valid: false,
      response: NextResponse.json(
        { error: 'Forbidden: Admin role required' },
        { status: 403 }
      ),
    };
  }

  return {
    valid: true,
    userId,
    adminClient,
  };
}

/**
 * Wrapper function to protect admin API routes
 * 
 * Usage:
 * ```ts
 * export async function POST(req: NextRequest) {
 *   const validation = await validateAdminRequest(req);
 *   if (!validation.valid) return validation.response;
 *   
 *   const { userId, adminClient } = validation;
 *   // Your admin logic here
 * }
 * ```
 */
export async function requireAdmin(
  req: NextRequest
): Promise<{ userId: string; adminClient: ReturnType<typeof getAdminClient> }> {
  const validation = await validateAdminRequest(req);
  if (!validation.valid) {
    throw new Error('Admin validation failed'); // This should be caught and validation.response returned
  }
  return { userId: validation.userId, adminClient: validation.adminClient };
}

