import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';

/**
 * Server-side authenticated user validation helper
 * 
 * Validates that the request is made by an authenticated user.
 * Returns the user ID from the token, not from the request body.
 * 
 * @param req - Next.js request object
 * @returns 
 *   - If valid: { valid: true, userId: string, adminClient: SupabaseClient }
 *   - If invalid: { valid: false, response: NextResponse } (ready to return)
 */
export async function validateAuthenticatedRequest(req: NextRequest): Promise<
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

  return {
    valid: true,
    userId,
    adminClient,
  };
}

/**
 * Wrapper function to protect authenticated API routes
 * 
 * Usage:
 * ```ts
 * export async function POST(req: NextRequest) {
 *   const validation = await validateAuthenticatedRequest(req);
 *   if (!validation.valid) return validation.response;
 *   
 *   const { userId, adminClient } = validation;
 *   // Use userId from token, never from request body
 *   // Your logic here
 * }
 * ```
 */

