# Firebase naar Supabase Migratie - Voortgang

**Datum:** 28 oktober 2025  
**Status:** 🔄 ~35% compleet

## ✅ Voltooid (Core Hooks Gemigreerd)

### 1. Authentication System
- [x] `src/hooks/use-auth.ts` - Volledig gemigreerd naar Supabase Auth
- [x] `src/app/login/page.tsx` - Login werkt met Supabase
- [x] Backup gemaakt: `use-auth.ts.firebase-backup`

### 2. User Collection Hook
- [x] `src/hooks/use-user-collection.ts` - Gemigreerd naar Supabase
- [x] Realtime subscriptions via Supabase channels
- [x] Support voor: declarations, leave_requests, weekly_logs, fines

### 3. Admin Data Hook
- [x] `src/hooks/use-admin-data.ts` - Volledig gemigreerd
- [x] Query alle admin data (users, logs, declarations, leave, fines, vehicles)
- [x] Gebruikt Supabase queries in plaats van Firestore

### 4. Weekly Logs Hook
- [x] `src/hooks/use-weekly-logs.ts` - Gemigreerd naar Supabase
- [x] Backup gemaakt: `use-weekly-logs.ts.firebase-backup`
- [x] Realtime subscriptions
- [x] Save/unlock/approve functionaliteit
- [x] Invoice generation logic

## ⚠️ Bekende Issues

### Data Structure Mismatches
De Supabase schema gebruikt snake_case, maar de app gebruikt camelCase:

**Profiles Table:**
- Supabase: `first_name`, `last_name`, `assigned_license_plates`
- App verwacht: `firstName`, `lastName`, `assignedLicensePlates`

**Customers Table:**
- Supabase: `assigned_license_plates` (array)
- App verwacht: `assignedLicensePlates`

**Solution:** Ofwel Supabase schema aanpassen, ofwel mapping layer maken

### Users Field Names
De app verwacht `uid` field maar Supabase profiles gebruikt `id`.

## 🚧 Nog Te Migreren

### Critical Files (hoge prioriteit)
- [ ] `src/app/api/upload/route.ts` - Firebase Storage → Supabase Storage
- [ ] `src/lib/types.ts` - Mogelijks aanpassingen nodig
- [ ] Alle admin pages die direct Firestore gebruiken

### Pages To Migrate (~40 files)
**Admin Pages:**
- [ ] `src/app/admin/users/` - User management
- [ ] `src/app/admin/fleet/` - Vehicle management
- [ ] `src/app/admin/customers/` - Customer management
- [ ] `src/app/admin/invoices/` - Invoice management
- [ ] Alle andere admin pages

**User Pages:**
- [ ] `src/app/declarations/` - Declarations page
- [ ] `src/app/fines/` - Fines page
- [ ] `src/app/leave/` - Leave requests
- [ ] `src/app/invoices/` - Invoice viewing

### API Routes
- [ ] `src/app/api/upload/route.ts` - Upload naar Supabase Storage
- [ ] `src/app/api/invoices/ingress/route.ts` - Mogelijk verwijderen

## 📋 Data Schema Mapping

### Firestore → Supabase

| Firestore Collection | Supabase Table | Status |
|---------------------|----------------|--------|
| users | profiles | ✅ Migrated |
| truckLogs | weekly_logs | ✅ Migrated |
| dailyLogs | daily_logs | ✅ Migrated |
| declarations | declarations | ✅ Hook ready |
| leaveRequests | leave_requests | ✅ Hook ready |
| fines | fines | ✅ Hook ready |
| vehicles | vehicles | ✅ Hook ready |
| customers | customers | ⚠️ Needs mapping |
| suppliers | suppliers | ⏳ Pending |
| invoices | invoices | ⏳ Pending |
| invoiceLines | invoice_lines | ⏳ Pending |
| weeklyRates | weekly_rates | ⏳ Pending |

## 🔧 Fixes Nodig

### 1. Field Name Mapping
Maak een utility functie om tussen camelCase en snake_case te converteren.

```typescript
// src/lib/utils.ts
export function mapSupabaseToApp<T>(data: any): T {
  // Convert snake_case to camelCase
  // Handle nested objects
  // Handle arrays
}
```

### 2. Authentication Users Migreren
Bestaande Firebase users moeten worden geregistreerd in Supabase Auth.
- Optie A: Users opnieuw registreren
- Optie B: Migration script maken

### 3. Firebase Storage Bestanden Migreren
Als er bestaande files zijn in Firebase Storage, moeten deze naar Supabase Storage.

## 🎯 Volgende Stappen

### Directe Prioriteit
1. **Fix Field Mapping** - Maak utility functie voor data conversion
2. **Test Login** - Zorg dat auth werkt in browser
3. **Migreer Upload API** - Storage functionaliteit
4. **Fix Type Definitions** - Update types.ts voor consistency

### Daarna
5. Migreer admin pages één voor één
6. Test elke functionaliteit
7. Cleanup Firebase code
8. Deploy naar Supabase

## 📊 Geschatte Resttijd

- Fix field mapping: 1 uur
- Upload API migratie: 2 uur
- Admin pages migreren: 6-8 uur
- Testing: 3-4 uur
- Cleanup: 1 uur

**Totaal:** ~13-16 uur werk

## 🚀 Deployment Checklist

- [ ] Alle hooks gemigreerd
- [ ] Alle pages gemigreerd
- [ ] Upload functionaliteit werkt
- [ ] Test users aangemaakt in Supabase
- [ ] Environment variables geconfigureerd
- [ ] Build zonder errors (`npm run build`)
- [ ] Firebase dependencies verwijderd
- [ ] Supabase deployment configureren



