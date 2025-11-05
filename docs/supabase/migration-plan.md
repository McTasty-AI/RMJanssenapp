Migratieplan Firebase -> Supabase

Overzicht collecties -> tabellen
- users -> profiles (auth.users + public.profiles)
- truckLogs -> weekly_logs + daily_logs
- leaveRequests -> leave_requests
- declarations -> declarations (+ receipts in Storage)
- fines -> fines (+ plaatjes in Storage)
- customers -> customers (+ customer_vehicle_assignments; weekly_rates)
- invoices -> invoices + invoice_lines (+ PDF in Storage)
- vehicles -> vehicles (+ vehicle_documents)
- suppliers -> suppliers
- purchase_invoices (afgeleid uit AI flow) -> purchase_invoices + purchase_invoice_lines
- weeklyRates -> weekly_rates

Stappen
1) Voorbereiding
   - Maak Supabase project + env vars in `.env` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
   - Draai `schema.sql` en daarna `rls.sql` in de Supabase SQL editor.
   - Maak Storage buckets aan en koppel policies (zie `storage-buckets.md`).

2) Auth migratie
   - Exporteer Firebase Auth users (UID, mail, displayName, disabled status).
   - Creëer gebruikers via `auth.admin.createUser({ email, email_confirm: true, password: temp })`.
   - Vul `public.profiles` op basis van huidige `users`-documenten (rol, status, persoonlijke velden).

3) Data migratie
   - Exporteer Firestore collecties naar JSON/NDJSON.
   - Schrijf een Node-script of SQL import die mapt naar tabellen:
     * `truckLogs`: maak eerst `weekly_logs`, daarna `daily_logs` records.
     * `customers`: maak `customers`; vul `customer_vehicle_assignments` op basis van `assignedLicensePlates` (zonder einddatum als historiek onbekend).
     * `invoices`: maak `invoices` + `invoice_lines`.
     * `fines`, `leave_requests`, `declarations` rechtstreeks mappen; converteer Storage URL -> relative `storage_path`.
     * `vehicles`: maak `vehicles` en `vehicle_documents` (indien aanwezig).
     * `weeklyRates` -> `weekly_rates`.

4) Opslag migratie (bestanden)
   - Download Firebase Storage bestanden per type
   - Upload naar Supabase Storage in de juiste bucket/padstructuur
   - Update bijbehorende `*_path` kolommen met de nieuwe Storage path.

5) Functionaliteit
   - Vervang Firebase client door Supabase client in frontend (`src/lib/supabase.ts`).
   - Auth flow: vervang `use-auth` naar Supabase sessies en `profiles` fetch.
   - Data access: vervang Firestore calls door `rpc`/`select`/`insert`/`update` naar tabellen met RLS.
   - Week goedkeuren -> trigger Edge Function of server action die conceptfactuur creëert (of DB-functie). Start eenvoudig: maak factuurregels zonder AI, AI later via Edge Function.
   - Boetes auto-koppelen via trigger is afgedekt in `schema.sql`.

6) Validatie
   - Vergelijk tellingen per collectie vs tabel.
   - Doorloop user journeys: chauffeur logt in, week invullen/indienen, admin keurt goed, conceptfactuur aangemaakt, declaraties/boetes zichtbaar.

7) Nazorg
   - Uitfaseren Firebase keys, verwijder Firebase SDK code zodra vervangen.
   - Monitor RLS denials in logs.

