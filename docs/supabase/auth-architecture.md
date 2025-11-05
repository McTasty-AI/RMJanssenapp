Authenticatie-architectuur (voorstel)

Optie A – Alleen Supabase Auth
- Gebruik Supabase Auth (email+password en magic links) voor chauffeurs en admins.
- Admin maakt nieuwe medewerkers via server-side (service role) call `supabase.auth.admin.createUser` met tijdelijke wachtwoorden of invite.
- Rollen/status in `public.profiles` beheren; RLS policies lezen dit uit.
- Next.js client gebruikt `@supabase/supabase-js` met SSR helpers (via route handlers of server actions) voor sessies.

Optie B – Supabase Auth + Auth.js (NewAuth/NextAuth)
- Supabase Auth is identity provider; Auth.js beheert session cookies en Next.js middleware.
- Gebruik de Supabase Adapter voor Auth.js of verifieer Supabase JWT in callbacks.
- Voordeel: rijke session handling en providers; Nadeel: extra laag complexiteit.

Aanbeveling
- Voor chauffeursportaal: Optie A is het simpelst en sluit goed aan bij RLS.
- Voor adminportaal met granularere sessies/impersonatie/2FA: Optie B is geschikt.

Beheer
- `profiles.role` en `profiles.status` bepalen toegang. Inactive -> deny en user wordt gesigned-out door RLS.
- Wachtwoordreset via Supabase standaard flows. Voordoor admin: invite of set temp password.

