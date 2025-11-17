# Firebase naar Supabase Migratie - Update

**Datum:** 28 oktober 2025  
**Status:** 🔄 ~45% compleet

## ✅ Nieuw Voltooid

### 1. Upload API Migratie ✅
- [x] `src/app/api/upload/route.ts` - Volledig gemigreerd naar Supabase Storage
- [x] POST endpoint voor file uploads
- [x] DELETE endpoint voor file deletion
- [x] Bucket mapping (declarations → receipts, etc.)
- [x] Error handling aangepast voor Supabase
- [x] Support voor alle 5 buckets: receipts, fines, invoices, purchase_invoices, vehicle_documents

### 2. Field Mapping Utilities ✅
- [x] `mapSupabaseToApp()` functie toegevoegd aan `src/lib/utils.ts`
- [x] `mapAppToSupabase()` functie toegevoegd
- [x] Automatische conversie van snake_case (Supabase) ↔ camelCase (app)
- [x] Recursieve mapping voor nested objects en arrays

### 3. Hooks Geüpdatet Met Mapping ✅
- [x] `use-auth.ts` - Gebruikt nu `mapSupabaseToApp` voor user data
- [x] `use-admin-data.ts` - Alle queries gebruiken mapping
- [x] `use-user-collection.ts` - Document mapping toegepast

## 📊 Totaal Compleet

### Core Functionaliteit
- ✅ Authentication (Supabase Auth)
- ✅ Database queries (Supabase PostgreSQL)
- ✅ File uploads (Supabase Storage)
- ✅ Field mapping (snake_case ↔ camelCase)
- ✅ Realtime subscriptions

### Migrated Files
1. `src/hooks/use-auth.ts` - Complete
2. `src/hooks/use-user-collection.ts` - Complete
3. `src/hooks/use-admin-data.ts` - Complete
4. `src/hooks/use-weekly-logs.ts` - Complete
5. `src/app/login/page.tsx` - Complete
6. `src/app/api/upload/route.ts` - Complete
7. `src/lib/utils.ts` - Field mapping toegevoegd

## ⚠️ Bekende Issues

### Users Field
De Supabase `profiles` table heeft geen `uid` field - alleen `id`. De mapping converteert `id` naar `uid` in de app.

### Complex Data Structures
Sommige hooks hebben nested data structuren die mogelijk extra mapping nodig hebben:
- Weekly logs met daily logs
- Invoices met invoice lines
- Customers met assigned license plates

### API Routes
- [ ] `src/app/api/invoices/ingress/route.ts` - Nog Firestore gebruiken
- [ ] Andere API routes mogelijk

## 🚧 Nog Te Migreren (~55%)

### Pages To Migrate (~40 files)
**Admin Pages:**
- [ ] `src/app/admin/users/` - User management pages
- [ ] `src/app/admin/fleet/` - Vehicle management
- [ ] `src/app/admin/customers/` - Customer CRUD
- [ ] `src/app/admin/invoices/` - Invoice management
- [ ] `src/app/admin/suppliers/` - Supplier CRUD
- [ ] `src/app/admin/purchases/` - Purchase invoices
- [ ] `src/app/admin/fines/` - Fines management
- [ ] `src/app/admin/declarations/` - Declarations admin
- [ ] Alle andere admin pages

**User Pages:**
- [ ] `src/app/declarations/` - Declarations form
- [ ] `src/app/fines/` - Fines viewing
- [ ] `src/app/leave/` - Leave requests
- [ ] `src/app/invoices/` - Invoice viewing
- [ ] `src/app/dashboard/` - Dashboard components

### API Routes
- [ ] `src/app/api/invoices/ingress/route.ts` - Inbound email processing
- [ ] Mogelijk andere API routes

### Cleanup
- [ ] Verwijder Firebase dependencies uit `package.json`
- [ ] Verwijder `src/lib/firebase.ts`
- [ ] Verwijder `src/lib/firebase-admin.ts`
- [ ] Verwijder Firestore/Firebase imports uit alle files
- [ ] Verwijder `firestore.rules` en `storage.rules`
- [ ] Verwijder Firebase config bestanden

## 🎯 Volgende Stappen

### Priority 1: Test Core Functionaliteit
1. **Start dev server** - `npm run dev`
2. **Test login** - Zorg dat users in Supabase staan
3. **Test een pagina** - Bijv. declarations of dashboard
4. **Verifieer field mapping** - Check of data correct wordt getoond

### Priority 2: Migreer Pages
Start met meest gebruikte pages:
1. Dashboard pages
2. Declarations form
3. Admin user management

### Priority 3: Cleanup & Deploy
1. Verwijder alle Firebase code
2. Test volledige app
3. Build voor productie
4. Deploy naar Supabase

## 📊 Progress Tracking

**Gemigreerd:** 7 core files  
**Nog te migreren:** ~40+ page files + cleanup  
**Geschatte resttijd:** ~10-12 uur

## 🚀 Deployment Voorbereiding

### Environment Variables Nodig
```env
NEXT_PUBLIC_SUPABASE_URL=https://msrhocbeoldpylwgccor.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
```

### Supabase Setup Checklist
- [x] Database schema aangemaakt
- [x] RLS policies geconfigureerd
- [x] Storage buckets aangemaakt
- [x] Storage policies geconfigureerd
- [ ] Test users aangemaakt
- [ ] Supabase project deployment settings
- [ ] Custom domain (optioneel)

## 💡 Quick Wins

1. **Test huidige migratie** - Verifieer dat auth en core functionaliteit werkt
2. **Migreer declarations page** - Relatief simpel, goed voor testing
3. **Pas pages aan die nog Firebase gebruiken** - Gebruik grep om te vinden
4. **Verwijder ongebruikte Firebase code** - Cleanup
















