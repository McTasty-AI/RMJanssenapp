# API Keys Security Guide

## Overzicht

Deze applicatie gebruikt verschillende publieke API keys die zichtbaar zijn in de client-side code. Het is **cruciaal** om deze keys correct te beveiligen met restricties in de respectievelijke cloud consoles.

## Publieke API Keys

### 1. Google Maps API Key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)

**Status**: ✅ Publiek zichtbaar (vereist voor client-side gebruik)

**Gebruik**:
- Google Maps JavaScript API (voor kaartweergave)
- Places API (voor adresautocomplete)
- Directions API (voor routeberekening in client-side)

**Waar gebruikt**:
- `src/app/layout.tsx` - Google Maps script tag
- `src/app/admin/ritprijsberekening/page.tsx` - Maps loader en route visualisatie
- `src/components/GooglePlacesAutocomplete.tsx` - Places autocomplete component

#### Beveiligingsinstellingen in Google Cloud Console

**Stap 1: Ga naar Google Cloud Console**
1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Selecteer je project
3. Ga naar **APIs & Services** → **Credentials**
4. Klik op je API key om te bewerken

**Stap 2: API Restrictions (API-beperkingen)**
1. Scroll naar **API restrictions**
2. Selecteer **Restrict key**
3. Voeg alleen de volgende APIs toe:
   - ✅ **Maps JavaScript API**
   - ✅ **Places API**
   - ✅ **Directions API**
   - ✅ **Geocoding API** (indien gebruikt)
4. **Verwijder alle andere APIs** uit de lijst

**Stap 3: Application Restrictions (Applicatiebeperkingen)**
1. Scroll naar **Application restrictions**
2. Selecteer **HTTP referrers (web sites)**
3. Voeg de volgende referrers toe:

**Voor Production:**
```
https://jouw-domein.vercel.app/*
https://*.vercel.app/*
https://jouw-domein.com/*
https://www.jouw-domein.com/*
```

**Voor Development (optioneel):**
```
http://localhost:9002/*
http://localhost:3000/*
http://127.0.0.1:9002/*
http://127.0.0.1:3000/*
```

**Belangrijk**:
- Gebruik `*` alleen aan het einde van het pad (niet in het domein)
- Voeg zowel `http://` als `https://` toe voor development
- Voeg alle subdomeinen toe die je gebruikt (bijv. `*.vercel.app`)

**Stap 4: Save**
1. Klik op **Save**
2. Wacht 5-10 minuten voor de wijzigingen actief worden

### 2. Google Maps API Key Server-Side (`GOOGLE_MAPS_API_KEY`)

**Status**: ✅ Server-side only (niet publiek)

**Gebruik**:
- Directions API (voor server-side routeberekening in AI flows)

**Waar gebruikt**:
- `src/ai/flows/calculate-distance-flow.ts` - Directions API calls

#### Beveiligingsinstellingen

**Stap 1: Maak een aparte API key voor server-side gebruik**
1. Ga naar Google Cloud Console → **APIs & Services** → **Credentials**
2. Klik op **+ CREATE CREDENTIALS** → **API key**
3. Geef de key een duidelijke naam (bijv. "RM Janssen - Server-side Maps API")

**Stap 2: API Restrictions**
1. Selecteer **Restrict key**
2. Voeg alleen toe:
   - ✅ **Directions API**
   - ✅ **Geocoding API** (indien nodig)

**Stap 3: Application Restrictions**
1. Selecteer **IP addresses (web servers, cron jobs, etc.)**
2. Voeg de IP-adressen toe van:
   - Vercel server IP ranges (indien bekend)
   - Je eigen server IP (indien self-hosted)
   - **OF** laat leeg als je alleen API restrictions gebruikt

**Alternatief**: Als je dezelfde key gebruikt voor client en server:
- Gebruik alleen **API Restrictions** (geen Application Restrictions)
- Dit is minder veilig maar praktischer voor kleine projecten

### 3. Google Generative AI API Key (`GOOGLE_GENAI_API_KEY`)

**Status**: ✅ Server-side only (niet publiek)

**Gebruik**:
- Google Gemini AI voor factuuranalyse, boeteanalyse, etc.

**Waar gebruikt**:
- `src/ai/flows/*` - Alle AI flows

#### Beveiligingsinstellingen

**Stap 1: API Restrictions**
1. Ga naar Google Cloud Console → **APIs & Services** → **Credentials**
2. Selecteer je API key
3. Bij **API restrictions**, selecteer **Restrict key**
4. Voeg alleen toe:
   - ✅ **Generative Language API**

**Stap 2: Application Restrictions**
1. Selecteer **IP addresses**
2. Voeg Vercel/server IP ranges toe
   - **OF** gebruik alleen API restrictions (minder veilig maar praktischer)

**Belangrijk**: Deze key mag **NOOIT** in client-side code komen!

### 4. Supabase Keys

**Status**: ✅ Gedeeltelijk publiek

#### `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ Publiek zichtbaar (vereist)
- Beveiligd via Supabase Row Level Security (RLS)
- Geen extra restricties nodig in Supabase dashboard

#### `SUPABASE_SERVICE_ROLE_KEY`
- ❌ **NOOIT** publiek maken!
- Alleen server-side gebruiken
- Beveiligd via Supabase project settings
- Controleer dat deze key nooit in client-side code staat

### 5. Email Ingress API Key (`EMAIL_INGRESS_API_KEY`)

**Status**: ✅ Server-side only (niet publiek)

**Gebruik**:
- Webhook authenticatie voor email-to-invoice functionaliteit

**Waar gebruikt**:
- `src/app/api/invoices/ingress/route.ts`

**Beveiliging**:
- Deze key is een zelf-gegenereerde geheime string
- Zorg dat deze overeenkomt met de key in je email provider settings
- Gebruik een sterke, willekeurige string (minimaal 32 karakters)

## Best Practices

### ✅ DO's

1. **Gebruik altijd API Restrictions**
   - Beperk elke key tot alleen de APIs die nodig zijn
   - Verwijder ongebruikte APIs uit de lijst

2. **Gebruik Application Restrictions**
   - Voor publieke keys: HTTP referrers (domains)
   - Voor server-side keys: IP addresses (indien mogelijk)

3. **Maak aparte keys voor verschillende doeleinden**
   - Client-side Maps key
   - Server-side Maps key
   - AI key
   - Dit maakt het makkelijker om restricties te beheren

4. **Monitor API Usage**
   - Check regelmatig Google Cloud Console → **APIs & Services** → **Dashboard**
   - Stel quota alerts in voor onverwachte spikes

5. **Roteer keys regelmatig**
   - Update keys minstens elk jaar
   - Of direct na een security incident

### ❌ DON'Ts

1. **Gebruik geen onbeperkte keys**
   - Zonder API restrictions
   - Zonder application restrictions

2. **Deel keys niet publiekelijk**
   - Niet in GitHub repositories (gebruik `.env.local`)
   - Niet in screenshots of documentatie
   - Niet in client-side code comments

3. **Gebruik geen service role keys in client-side code**
   - Controleer altijd of keys met `NEXT_PUBLIC_` prefix nodig zijn
   - Server-side keys moeten altijd zonder `NEXT_PUBLIC_` prefix

4. **Vergeet niet om restricties te testen**
   - Test na het instellen van restricties of alles nog werkt
   - Controleer zowel development als production omgevingen

## Monitoring & Alerts

### Google Cloud Console Monitoring

1. **API Usage Dashboard**
   - Ga naar **APIs & Services** → **Dashboard**
   - Bekijk usage per API
   - Stel alerts in voor onverwachte spikes

2. **Quota & Limits**
   - Ga naar **APIs & Services** → **Quotas**
   - Stel daily/monthly limits in
   - Configureer email alerts bij quota bereik

3. **Billing Alerts**
   - Ga naar **Billing** → **Budgets & alerts**
   - Stel een budget in voor API kosten
   - Configureer alerts bij onverwachte kosten

### Supabase Monitoring

1. **API Usage**
   - Ga naar Supabase Dashboard → **Settings** → **API**
   - Bekijk request counts en error rates

2. **Database Activity**
   - Ga naar **Database** → **Logs**
   - Monitor voor ongebruikelijke queries

## Checklist voor Deployment

Voordat je naar productie gaat, controleer:

- [ ] Google Maps API key heeft API restrictions (alleen Maps, Places, Directions)
- [ ] Google Maps API key heeft HTTP referrer restrictions (alleen jouw domeinen)
- [ ] Google Maps server-side key heeft API restrictions
- [ ] Google GenAI API key heeft API restrictions (alleen Generative Language API)
- [ ] Alle keys zijn getest in development omgeving
- [ ] Quota limits zijn ingesteld in Google Cloud Console
- [ ] Billing alerts zijn geconfigureerd
- [ ] `SUPABASE_SERVICE_ROLE_KEY` wordt alleen server-side gebruikt
- [ ] Geen keys staan in GitHub repository (check `.gitignore`)
- [ ] Environment variables zijn correct ingesteld in Vercel

## Troubleshooting

### "This API key is not authorized"

**Oorzaak**: API restriction blokkeert de API call

**Oplossing**:
1. Check Google Cloud Console → Credentials
2. Controleer of de juiste API is toegevoegd aan de key
3. Wacht 5-10 minuten na wijzigingen

### "Referer not allowed"

**Oorzaak**: HTTP referrer restriction blokkeert het domein

**Oplossing**:
1. Check de exacte URL in de browser console error
2. Voeg het domein toe aan HTTP referrers in Google Cloud Console
3. Zorg dat je zowel `http://` als `https://` toevoegt (indien nodig)
4. Wacht 5-10 minuten na wijzigingen

### "Quota exceeded"

**Oorzaak**: API quota is bereikt

**Oplossing**:
1. Check Google Cloud Console → Quotas
2. Verhoog quota indien nodig
3. Of wacht tot quota reset (meestal dagelijks)

## Aanvullende Resources

- [Google Cloud API Key Best Practices](https://cloud.google.com/docs/authentication/api-keys)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

