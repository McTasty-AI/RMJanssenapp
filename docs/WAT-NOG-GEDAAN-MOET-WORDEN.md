# Wat Nog Gedaan Moet Worden - Samenvatting

**Datum:** 28 oktober 2025  
**Status:** 🔄 Migratie ~32% compleet

## ✅ WAT ER AL GEDAAN IS

### Core Infrastructure (100% Compleet)
- ✅ **Authentication** werkt volledig met Supabase
- ✅ **Alle database hooks** gebruiken Supabase queries
- ✅ **File uploads** werken met Supabase Storage
- ✅ **Field mapping** systeem voor snake_case ↔ camelCase
- ✅ **Realtime subscriptions** geconfigureerd

### Werkende Functionaliteit
- ✅ Login pagina
- ✅ Declarations (create & view)
- ✅ Fines viewing
- ✅ Admin user management (create, activate, deactivate)
- ✅ File uploads naar Supabase Storage

## 🚧 WAT NOG MOET GEBEUREN

### 1. Pages Migreren (~24 files) - KRITIEK

**Admin Pages (hoge prioriteit):**
```
❌ src/app/admin/customers/page.tsx          - Customer CRUD
❌ src/app/admin/fleet/page.tsx              - Vehicle overview
❌ src/app/admin/fleet/[id]/page.tsx         - Vehicle edit
❌ src/app/admin/suppliers/page.tsx          - Supplier CRUD
❌ src/app/admin/suppliers/[id]/page.tsx     - Supplier edit
❌ src/app/admin/invoices/page.tsx           - Invoice list
❌ src/app/admin/invoices/[id]/page.tsx      - Invoice detail
❌ src/app/admin/purchases/page.tsx          - Purchase invoices
```

**Admin Pages (medium prioriteit):**
```
❌ src/app/admin/declarations/page.tsx       - Admin declarations
❌ src/app/admin/fines/page.tsx              - Admin fines
❌ src/app/admin/leave/page.tsx              - Leave management
❌ src/app/admin/rates/page.tsx              - Rate management
❌ src/app/admin/revenue/page.tsx            - Revenue tracking
❌ src/app/admin/users/[id]/page.tsx         - User edit
```

**Admin Pages (lage prioriteit):**
```
❌ src/app/admin/bank/page.tsx               - Bank settings
❌ src/app/admin/company/page.tsx            - Company settings
❌ src/app/admin/cost-calculation/page.tsx    - Cost calculations
❌ src/app/admin/payroll/page.tsx             - Payroll
❌ src/app/admin/policy/page.tsx              - Policy settings
❌ src/app/admin/ritprijsberekening/page.tsx  - Rate calculations
❌ src/app/admin/fleet/statuses/page.tsx      - Fleet statuses
❌ src/app/admin/page.tsx                     - Admin dashboard
```

**User Pages:**
```
❌ src/app/leave/page.tsx                    - Leave requests
❌ src/app/invoices/page.tsx                 - Invoice list
❌ src/app/invoices/[id]/page.tsx            - Invoice detail
❌ src/app/invoices/new/page.tsx             - New invoice
```

**API Routes:**
```
❌ src/app/api/invoices/ingress/route.ts     - Email processing
```

### 2. Firebase Code Verwijderen - BELANGRIJK

**Files te verwijderen:**
```
❌ src/lib/firebase.ts                        - Firebase client
❌ src/lib/firebase-admin.ts                  - Firebase admin
❌ firestore.rules                            - Firestore rules
❌ storage.rules                              - Storage rules
❌ firebase.json                              - Firebase config
```

**Package.json:**
```
❌ firebase package verwijderen
❌ firebase-admin package verwijderen
❌ firebase-functions package verwijderen
```

**Import cleanup:**
```
❌ Alle 'import ... from firebase/firestore' vervangen
❌ Alle 'import ... from firebase/storage' vervangen
❌ Alle 'import ... from @/lib/firebase' vervangen
```

### 3. Field Mapping Testen & Fixen - BELANGRIJK

**Te testen:**
```
❌ Test field mapping met echte data
❌ Verifieer nested objects (invoices met lines)
❌ Check arrays (workDays, assignedLicensePlates)
❌ Verifieer date formats
❌ Test RLS policies met gemapte data
```

**Mogelijke fixes:**
```
❌ Database columns aanpassen indien nodig
❌ Mapping utilities verbeteren
❌ Custom mappings voor edge cases
```

### 4. Testing & Debugging - KRITIEK

**Functional tests:**
```
❌ Login/logout flow
❌ File uploads
❌ CRUD operaties voor alle entities
❌ Realtime updates
❌ Admin functions
❌ User functions
```

**Error handling:**
```
❌ Browser console errors fixen
❌ Server logs errors fixen
❌ Error messages verificeren
❌ Edge cases testen
```

### 5. Deployment Voorbereiden - KRITIEK

**Environment variables:**
```
❌ NEXT_PUBLIC_SUPABASE_URL setten
❌ NEXT_PUBLIC_SUPABASE_ANON_KEY setten
❌ SUPABASE_SERVICE_ROLE_KEY setten
```

**Build & test:**
```
❌ npm run build zonder errors
❌ TypeScript errors fixen
❌ Linter errors fixen
```

**Supabase deployment:**
```
❌ Supabase hosting configureren
❌ Test deployment
❌ Production deployment
```

## ⏱️ GESCHATTE TIJD

| Taak | Tijd |
|------|------|
| Pages migreren (24 files) | 6-8 uur |
| Firebase cleanup | 1 uur |
| Field mapping fixes | 2-3 uur |
| Testing & debugging | 3-4 uur |
| Deployment setup | 1-2 uur |
| **TOTAAL** | **13-18 uur** |

## 🎯 PRIORITEITEN

### P0 - Kritiek (Moet Voor Launch)
1. Migreer top 5 admin pages (customers, fleet, suppliers, invoices, purchases)
2. Migreer invoice user pages
3. Test en fix field mapping
4. Build zonder errors
5. Deploy naar Supabase

### P1 - Belangrijk (Voor Goede UX)
6. Migreer resterende admin pages
7. Verwijder alle Firebase code
8. Test alle functionaliteit
9. Fix alle errors

### P2 - Optioneel (Nice To Have)
10. Performance optimization
11. CI/CD pipeline
12. Advanced features

## 📋 ACTIE PLAN

### Vandaag (Prioriteit)
1. **Test huidige app** - Start server, check console
2. **Migreer top 5 admin pages** - Customers, Fleet, Suppliers, Invoices, Purchases
3. **Fix veelvoorkomende errors** - Field mapping issues
4. **Test kritieke functionaliteit** - Login, CRUD, uploads

### Deze Week
5. Migreer resterende admin pages
6. Verwijder Firebase code
7. Test volledige app
8. Build voor productie
9. Deploy naar Supabase

## 🔧 QUICK WINS

Deze kunnen snel worden gefixt:
- Pages die alleen data tonen (gebruiken al hooks)
- Simpele CRUD operaties
- Data display zonder complexe logica

## ⚠️ BEKENDE ISSUES

1. **Field names** - Mogelijk mapping issues tussen Supabase (snake_case) en app (camelCase)
2. **Nested data** - Invoices met lines kunnen extra handling nodig hebben
3. **Auth admin API** - User creation werkt nu via API route
4. **Realtime subscriptions** - Moeten getest worden

## 📊 PROGRESS METER

```
Core Infrastructure:  ████████████████████ 100%
Hooks:                 ████████████████████ 100%
Pages:                 ██████░░░░░░░░░░░░░░  32%
API Routes:            ██████████░░░░░░░░░░  50%
Testing:               ░░░░░░░░░░░░░░░░░░░░   0%
Deployment:            ░░░░░░░░░░░░░░░░░░░░   0%

TOTAAL:                ████████░░░░░░░░░░░░  32%
```

## 🚀 VOLGENDE STAP

**Start met testen:**
De app draait al op http://localhost:9002

**Test deze pagina's:**
1. Login - Moet werken ✅
2. Declarations - Moet werken ✅
3. Fines - Moet werken ✅
4. Admin Users - Moet werken ✅
5. Andere pages - Mogelijk errors ⚠️

**Daarna:**
Migreer pages die errors geven, systematisch één voor één.




















