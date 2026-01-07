# RMJ Driver Mobile (Expo + React Native)

Mobiele app voor chauffeurs om uren, verlof, declaraties, boetes en schades in te dienen. Gebouwd met Expo (React Native) en gekoppeld aan dezelfde Supabase-backend als de webapp.

## Installatie

```bash
cd mobile
npm install
# Gebruik eventueel: npx expo install <pkg> om versies te aligneren met je lokale Expo SDK
```

## Environment

Maak een `.env` (of `.env.local`) in `mobile/` met:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Dezelfde keys als de webapp kunnen worden gebruikt.

## Starten

```bash
cd mobile
npm start         # opent Expo dev tools
npm run android   # direct naar emulator/device
npm run ios       # macOS + Xcode vereist
```

## Features (eerste versie)

- Supabase-auth (email/password) met sessie-opslag via AsyncStorage
- Tab-navigatie: Uren, Verlof, Declaraties, Boetes, Schades
- Formulieren posten naar Supabase tabellen:
  - `weekly_logs` + `daily_logs` (uren)
  - `leave_requests`
  - `declarations` + upload naar `receipts` bucket
  - `fines`
  - `damage_reports` (nieuwe tabel nodig – zie TODO)

## TODO / Volgende stappen

- Tabellen/SQL:
  - Voeg een `damage_reports`-tabel toe aan Supabase (user_id, vehicle_id?, date, description, photos[])
  - Bevestig dat de buckets `receipts` (voor declaraties/boetes) bestaan
- UX:
  - Gebruik native date/time pickers, validaties en pending states per veld
  - Voeg offline queueing / retry toe voor slechte connecties
- Integraties:
  - Push notificaties (Expo Notifications) zodra admin items keurt
  - Deep links via `rmjdriver://`

### Suggestie SQL `damage_reports`

```sql
create table if not exists damage_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  license_plate text,
  date date not null,
  description text not null,
  severity text,
  photo_paths text[],
  status text default 'open',
  created_at timestamptz default now()
);
create index if not exists damage_reports_user_idx on damage_reports(user_id);
```

## Mapstructuur

```
mobile/
  app/                # expo-router routes
  src/
    components/       # herbruikbare UI
    hooks/            # auth/supabase hooks
    lib/              # supabase client + storage helpers
    utils/            # helpers (week-id, formats)
```

