# Firebase naar Supabase Migratie - Huidige Staat

**Datum:** 28 oktober 2025  
**Laatste Update:** Tijdens actieve migratie

## ✅ Voltooid - Core Infrastructure (11 files)

### Hooks & Core Systems ✅
1. ✅ `src/hooks/use-auth.ts` - Supabase Auth
2. ✅ `src/hooks/use-user-collection.ts` - User data queries
3. ✅ `src/hooks/use-admin-data.ts` - Admin data
4. ✅ `src/hooks/use-weekly-logs.ts` - Weekly logs met realtime

### Pages Gemigreerd ✅
5. ✅ `src/app/login/page.tsx` - Login
6. ✅ `src/app/declarations/page.tsx` - Declarations form
7. ✅ `src/app/fines/page.tsx` - Fines viewing
8. ✅ `src/app/admin/users/page.tsx` - User management

### API & Utils ✅
9. ✅ `src/app/api/upload/route.ts` - Supabase Storage
10. ✅ `src/app/api/admin/create-user/route.ts` - User creation API
11. ✅ `src/lib/utils.ts` - Field mapping utilities

## 🚧 Nog Te Migreren (~24 files)

### Admin Pages (~18 files)
- [ ] `src/app/admin/bank/page.tsx`
- [ ] `src/app/admin/company/page.tsx`
- [ ] `src/app/admin/cost-calculation/page.tsx`
- [ ] `src/app/admin/customers/page.tsx`
- [ ] `src/app/admin/declarations/page.tsx`
- [ ] `src/app/admin/fines/page.tsx`
- [ ] `src/app/admin/fleet/page.tsx` & `[id]/page.tsx` & `statuses/page.tsx`
- [ ] `src/app/admin/leave/page.tsx`
- [ ] `src/app/admin/payroll/page.tsx`
- [ ] `src/app/admin/policy/page.tsx`
- [ ] `src/app/admin/purchases/page.tsx`
- [ ] `src/app/admin/rates/page.tsx`
- [ ] `src/app/admin/revenue/page.tsx`
- [ ] `src/app/admin/ritprijsberekening/page.tsx`
- [ ] `src/app/admin/suppliers/page.tsx` & `[id]/page.tsx`
- [ ] `src/app/admin/users/[id]/page.tsx`
- [ ] `src/app/admin/page.tsx`

### User Pages (~3 files)
- [ ] `src/app/leave/page.tsx`
- [ ] `src/app/invoices/page.tsx` & `[id]/page.tsx` & `new/page.tsx`

### API Routes (~1 file)
- [ ] `src/app/api/invoices/ingress/route.ts`

## 📊 Progress

**Gemigreerd:** 11 files  
**Nog te migreren:** ~24 files  
**Compleet:** ~32% van alle files

## 🎯 Strategie Voor De Rest

### Optie A: Systematisch Doorwerken
- Migreer admin page voor admin page
- Duurt langer maar volledig gecontroleerd
- **Geschatte tijd:** 6-8 uur

### Optie B: Bulk Replace Script
- Maak automatische replacements voor veelvoorkomende patterns
- Sneller maar minder controle
- **Geschatte tijd:** 2-3 uur

### Optie C: Test Nu & Migreer Bij Errors
- Start de app en test
- Migreer alleen pages die errors geven
- **Snelle tijd:** 1-2 uur + bugfixes later

## 💡 Recommendation

**Optie C is het beste nu:**
1. De core infrastructure is compleet
2. Veel pages werken al via hooks
3. Test wat werkt, fix wat breekt
4. Migreer rest op basis van echte errors

## ⚠️ Bekende Issues

1. **Supabase Auth Admin API** - Client kan niet `auth.admin.createUser()` gebruiken
   - **Fix:** Via API route `/api/admin/create-user` (gemaakt)

2. **Field Names** - Snake_case vs camelCase
   - **Fix:** Mapping utilities in place
   - **Status:** Werkend maar moet getest worden

3. **Nested Data** - Invoices met lines, etc.
   - **Fix:** Apart queries voor main + relations
   - **Status:** In progress

## 🚀 Next Action

**Test de app:**
```bash
npm run dev
```

Test functionaliteit:
- Login
- Declarations (form + list)
- Fines viewing
- Admin users (create, activate, deactivate)

Dan beslissen: verder migreren of eerst testen?




















