# Firebase naar Supabase Migratie Plan

## Overzicht
Volledige migratie van Firebase naar Supabase voor RM Janssen Transport Management App.

## Wat wordt gemigreerd

### 1. Authentication ✅
**Van:** Firebase Auth (`signInWithEmailAndPassword`, `onAuthStateChanged`)  
**Naar:** Supabase Auth (`signInWithPassword`, `onAuthStateChange`)

**Gevolgen:**
- Login systeem vervangen
- Auth state management aanpassen
- User sessions anders afhandelen

### 2. Database ✅
**Van:** Firestore (NoSQL documents)  
**Naar:** Supabase PostgreSQL (relational database)

**Voordeel:** Schema is al aangemaakt! (21 tabellen)

**Gevolgen:**
- `doc()`, `collection()`, `onSnapshot()` → Supabase queries
- Realtime subscriptions anders
- Data structuur converteert naar relations

### 3. Storage ✅
**Van:** Firebase Storage  
**Naar:** Supabase Storage

**Voordeel:** Buckets zijn al aangemaakt (receipts, fines, invoices, etc.)

**Gevolgen:**
- Upload API aanpassen
- File paths/URLs anders
- Permissions via RLS policies

### 4. Admin Functions ❌
**Van:** Firebase Admin SDK  
**Naar:** Supabase RLS + Edge Functions (optioneel)

**Gevolgen:**
- Service account niet meer nodig
- Admin operaties via RLS policies

## Migratie Volgorde

### Fase 1: Supabase Auth Setup ✅
- [x] Supabase client configureren
- [ ] Auth hooks migreren (`use-auth.ts`)
- [ ] Login page updaten
- [ ] Signout functionaliteit

### Fase 2: Database Queries Migreren
- [ ] `use-weekly-logs.ts` → Supabase queries
- [ ] `use-user-collection.ts` → Supabase queries
- [ ] `use-admin-data.ts` → Supabase queries
- [ ] Alle admin pages updaten

### Fase 3: Storage Migreren
- [ ] Upload API aanpassen (`app/api/upload/route.ts`)
- [ ] File handling updaten
- [ ] Receipts storage migreren

### Fase 4: Cleanup
- [ ] Firebase dependencies verwijderen
- [ ] Firebase config files verwijderen
- [ ] firestore.rules verwijderen
- [ ] storage.rules verwijderen

### Fase 5: Deployment
- [ ] Supabase deployment configureren
- [ ] Environment variables setten
- [ ] Test in productie

## Files die aangepast moeten worden

### Core Files (hoge prioriteit)
1. `src/lib/firebase.ts` → Verwijderen of vervangen
2. `src/lib/firebase-admin.ts` → Verwijderen
3. `src/hooks/use-auth.ts` → Volledig herschrijven
4. `src/app/login/page.tsx` → Supabase auth gebruiken

### Hooks (medium prioriteit)
- `src/hooks/use-weekly-logs.ts`
- `src/hooks/use-user-collection.ts`
- `src/hooks/use-admin-data.ts`
- `src/hooks/use-monthly-report.ts`

### Page Components (medium-lage prioriteit)
- Alle admin pages gebruiken Firestore
- Declarations, fines, invoices pages
- Dashboard components

### API Routes
- `src/app/api/upload/route.ts` → Supabase Storage
- `src/app/api/invoices/ingress/route.ts` → Mogelijk verwijderen

## Risico's & Mitigatie

### Risico: Data verlies tijdens migratie
**Mitigatie:** 
- Supabase schema is al aangemaakt
- Firestore data eerst exporteren
- Migratie script maken voor bestaande data

### Risico: Down time tijdens deployment
**Mitigatie:**
- Parallel migreren waar mogelijk
- Feature flags gebruiken voor rollback

### Risico: Authentication conflicts
**Mitigatie:**
- Gebruikers opnieuw registreren in Supabase
- Of: Firebase Auth tokens valideren via Edge Function

## Supabase Edge Functions (optioneel)

Voor geavanceerde functionaliteit kunnen we Supabase Edge Functions gebruiken:
- PDF generatie
- Email sending
- Complex business logic

## Deployment Configuratie

### Supabase Project
- Project Ref: `msrhocbeoldpylwgccor`
- Region: Europe (waarschijnlijk)
- Database: PostgreSQL 17.6

### Environment Variables Nodig
```env
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key] # Alleen server-side
```

## Voordelen van Migratie

✅ **Al Database Schema:** Geen nieuwe structuur nodig  
✅ **RLS Policies:** Security al geconfigureerd  
✅ **Storage Buckets:** Al aangemaakt  
✅ **MCP Integration:** Werkt al  
✅ **Relational Data:** Beter voor complexe queries  
✅ **PostgreSQL:** Bekende SQL syntax  
✅ **Open Source:** Geen vendor lock-in  
✅ **Deployment:** Simpler dan Firebase  

## Timeline Schatting

- Fase 1 (Auth): 2-3 uur
- Fase 2 (Database): 6-8 uur
- Fase 3 (Storage): 2-3 uur
- Fase 4 (Cleanup): 1 uur
- Fase 5 (Deployment): 1-2 uur

**Totaal:** ~12-17 uur werk

## Status
🔄 **In Uitvoering**



