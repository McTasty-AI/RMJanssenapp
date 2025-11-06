# Environment Variables voor Vercel Deployment

## Verplichte Environment Variables

### Supabase (Database & Authentication)
- **`NEXT_PUBLIC_SUPABASE_URL`**
  - Je Supabase project URL
  - Voorbeeld: `https://xxxxx.supabase.co`
  - Waar te vinden: Supabase Dashboard → Project Settings → API → Project URL

- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**
  - Je Supabase anonymous/public key
  - Wordt gebruikt voor client-side authenticatie
  - Waar te vinden: Supabase Dashboard → Project Settings → API → anon/public key

- **`SUPABASE_SERVICE_ROLE_KEY`**
  - Je Supabase service role key (geheim!)
  - Wordt gebruikt voor server-side admin operaties
  - Waar te vinden: Supabase Dashboard → Project Settings → API → service_role key
  - ⚠️ **BELANGRIJK**: Deze key moet geheim blijven en mag nooit in client-side code komen

### Google Maps API
- **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`**
  - Google Maps API key voor Places Autocomplete en Directions API
  - Wordt gebruikt voor adresautocomplete en routeberekening
  - Waar te krijgen: Google Cloud Console → APIs & Services → Credentials
  - Vereiste APIs: Places API, Directions API, Maps JavaScript API

- **`GOOGLE_MAPS_API_KEY`**
  - Server-side Google Maps API key (voor Directions API in AI flows)
  - Kan dezelfde zijn als NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, maar kan ook een aparte server key zijn
  - Waar te krijgen: Google Cloud Console → APIs & Services → Credentials

### Google Genkit AI (Gemini)
- **`GOOGLE_GENAI_API_KEY`**
  - Google Generative AI API key voor Genkit/Gemini
  - Wordt gebruikt voor AI-functionaliteit (factuuranalyse, boeteanalyse, etc.)
  - Waar te krijgen: Google AI Studio → Get API Key
  - Of: Google Cloud Console → APIs & Services → Credentials → Create Credentials → API Key

### Email Ingress (Optioneel)
- **`EMAIL_INGRESS_API_KEY`**
  - API key voor email webhook ingress (voor email-to-invoice functionaliteit)
  - Alleen nodig als je email ingress functionaliteit gebruikt
  - Kan een willekeurige geheime string zijn die je zelf genereert

## Optionele Environment Variables

- **`NODE_ENV`**
  - Wordt automatisch ingesteld door Vercel als `production`
  - Niet handmatig nodig om in te stellen

- **`DATABASE_URL`** (alleen voor lokale database scripts)
  - Wordt alleen gebruikt door `scripts/run-supabase-sql.js`
  - Niet nodig voor Vercel deployment (gebruikt Supabase direct)

## Vercel Setup Instructies

1. Ga naar je Vercel project dashboard
2. Navigeer naar **Settings** → **Environment Variables**
3. Voeg alle bovenstaande variabelen toe:
   - Voor **Production**, **Preview**, en **Development** environments
   - Of alleen voor **Production** als je alleen daar deployt
4. Zorg ervoor dat je de juiste waarden gebruikt:
   - Kopieer de exacte waarden uit je Supabase/Google Cloud dashboards
   - Controleer op extra spaties of nieuwe regels
5. Na het toevoegen van variabelen, trigger een nieuwe deployment:
   - Ga naar **Deployments** tab
   - Klik op de drie puntjes van de laatste deployment
   - Kies **Redeploy**

## Veiligheidstips

- ✅ Gebruik altijd `NEXT_PUBLIC_` prefix voor variabelen die in de browser beschikbaar moeten zijn
- ✅ Gebruik **geen** `NEXT_PUBLIC_` prefix voor geheime keys (zoals `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENAI_API_KEY`)
- ✅ Controleer dat `SUPABASE_SERVICE_ROLE_KEY` nooit in client-side code wordt gebruikt
- ✅ Beperk je Google Maps API key met HTTP referrers (domains) in Google Cloud Console
- ✅ Gebruik environment-specifieke keys waar mogelijk (development vs production)

## ⚠️ Belangrijk: API Keys Security

**Lees de uitgebreide security guide**: [`docs/API-KEYS-SECURITY.md`](./API-KEYS-SECURITY.md)

Deze guide bevat:
- Stap-voor-stap instructies voor het beveiligen van Google Maps API keys
- Instellingen voor API restrictions en application restrictions
- Best practices voor alle publieke API keys
- Monitoring en alerting configuratie
- Troubleshooting tips

**Vooral belangrijk voor Google Maps API keys**:
- Stel **API Restrictions** in (alleen Maps, Places, Directions APIs)
- Stel **HTTP Referrer Restrictions** in (alleen jouw domeinen)
- Test restricties na het instellen

## Testen na Deployment

Na het instellen van alle environment variables, test:
1. ✅ Login functionaliteit (Supabase Auth)
2. ✅ Database queries (Supabase)
3. ✅ Google Maps autocomplete (adres invoervelden)
4. ✅ AI functionaliteit (factuur upload en analyse)
5. ✅ Route berekening (als je die functionaliteit gebruikt)

