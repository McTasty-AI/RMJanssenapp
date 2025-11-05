# Admin Accounts: Setup and User Management

This project uses Supabase Auth for authentication and a `profiles` table for roles. Admins can create users via a secure API and promote/demote roles.

## Promote an Admin Manually (SQL)

Run in Supabase SQL editor:

```
-- Promote an existing profile by email
update profiles set role = 'admin', status = 'active'
where email = 'admin@example.com';

-- Or seed a new admin profile (if auth user already exists)
insert into profiles (id, email, first_name, last_name, role, status)
values ('<AUTH_USER_ID>', 'admin@example.com', 'Admin', 'User', 'admin', 'active')
on conflict (id) do update set role = excluded.role, status = excluded.status;
```

Note: The built-in helper function `is_admin()` checks `profiles.role = 'admin'` for the current `auth.uid()`.

## RLS Policies

Ensure these policies are applied (docs/supabase/rls.sql):

- Users may insert their own profile on first login:
```
create policy "profiles self insert" on profiles
  for insert with check (id = auth.uid());
```
- Admins may update any profile:
```
create policy "profiles admin update" on profiles
  for update using (is_admin()) with check (is_admin());
```

## Admin Create-User API

Endpoint (server): `POST /api/admin/create-user`

Auth: Requires a Bearer token of a signed-in admin. The route verifies the caller is admin and uses the service role to create the new user and their profile.

Request body:
```
{
  "email": "user@example.com",
  "password": "TempPass123!",
  "firstName": "First",
  "lastName": "Last",
  "role": "user" // or "admin" (optional, default user)
}
```

Client example (on an admin session):
```ts
import { supabase } from '@/lib/supabase/client';

const { data: { session } } = await supabase.auth.getSession();
await fetch('/api/admin/create-user', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'TempPass123!',
    firstName: 'First',
    lastName: 'Last',
    role: 'user',
  }),
});
```

## Admin Provision-Profile API

Endpoint: `POST /api/admin/provision-profile`

Auth: Requires admin Bearer token. Upserts a `profiles` row for the given user id.

Request body:
```
{
  "userId": "<AUTH_USER_ID>",
  "email": "user@example.com",
  "firstName": "First",
  "lastName": "Last",
  "role": "user",
  "status": "active"
}
```

Use this when an Auth user exists but lacks a `profiles` row, or to promote/demote roles centrally.

