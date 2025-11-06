# Admin Security & Role Validation

## Overzicht

Alle admin-gerelateerde routes en API endpoints zijn beveiligd met server-side rolvalidatie. Dit document beschrijft hoe de beveiliging werkt en hoe deze te gebruiken.

## Server-Side Validatie

### Centrale Helper Functie

De centrale helper functie `validateAdminRequest` bevindt zich in `src/lib/auth/server-admin.ts` en valideert:

1. **Token aanwezigheid**: Controleert of er een Bearer token in de Authorization header zit
2. **Token validiteit**: Valideert het token met Supabase Auth
3. **Admin rol**: Controleert of de gebruiker de `admin` rol heeft in de `profiles` tabel

### Gebruik in API Routes

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { validateAdminRequest } from '@/lib/auth/server-admin';

export async function POST(req: NextRequest) {
  try {
    // Validate admin role
    const validation = await validateAdminRequest(req);
    if (!validation.valid) {
      return validation.response; // Returns 401 or 403 with error message
    }

    // Access validated admin client and user ID
    const { userId, adminClient } = validation;
    
    // Your admin logic here
    // ...
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Beveiligde Routes

### Admin Page Routes (`/admin/*`)

Beveiligd via **Next.js Middleware** (`src/middleware.ts`):
- Controleert authenticatie via cookie (`rmj_at`)
- Valideert token met Supabase Auth
- Controleert admin rol in profiles tabel
- Redirect naar `/login` als niet geauthenticeerd
- Redirect naar `/dashboard` als geen admin rol

### Admin API Routes (`/api/admin/*`)

**Dubbele beveiliging**:

1. **Middleware** (`src/middleware.ts`):
   - Eerste laag van beveiliging
   - Controleert authenticatie en admin rol
   - Retourneert JSON error responses (401/403) voor API calls

2. **Route Handler Validatie**:
   - Tweede laag van beveiliging
   - Elke admin API route gebruikt `validateAdminRequest()`
   - Extra validatie voor extra beveiliging

### Huidige Admin API Routes

1. **`POST /api/admin/create-user`**
   - Maakt nieuwe gebruikers aan
   - Vereist: email, password, firstName, lastName, role (optioneel)

2. **`POST /api/admin/users/update-role`**
   - Wijzigt gebruikersrol
   - Vereist: userId, role ('admin' of 'user')

3. **`POST /api/admin/provision-profile`**
   - Maakt/update gebruikersprofiel
   - Vereist: userId, optioneel: email, firstName, lastName, role, status

## Response Codes

### 401 Unauthorized
- Geen token aanwezig
- Token is ongeldig of verlopen
- Gebruiker bestaat niet

### 403 Forbidden
- Token is geldig, maar gebruiker heeft geen admin rol
- Gebruiker is geauthenticeerd maar niet geautoriseerd

### 500 Internal Server Error
- Fout bij het ophalen van gebruikersprofiel
- Database fout

## Best Practices

1. **Altijd validatie gebruiken**: Gebruik `validateAdminRequest()` in alle admin API routes
2. **Geen client-side validatie**: Vertrouw nooit alleen op client-side checks
3. **Consistente error messages**: Gebruik de gestandaardiseerde error responses
4. **Logging**: Overweeg logging toe te voegen voor security events (optioneel)

## Toekomstige Uitbreidingen

- Rate limiting voor admin routes
- Audit logging voor admin acties
- IP whitelisting voor kritieke admin operaties
- MFA vereiste voor admin operaties

