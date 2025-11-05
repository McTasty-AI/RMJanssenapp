# RM Janssen App

Een moderne webapplicatie voor urenregistratie, factuurbeheer en administratie voor vrachtwagenchauffeurs.

## Features

- **Urenregistratie**: Weekstaten invullen en beheren
- **Factuurbeheer**: Verkoop- en inkoopfacturen beheren met AI-analyse
- **Declaraties**: Declaraties indienen en goedkeuren
- **Verlofbeheer**: Verlofaanvragen indienen en beheren
- **Boetebeheer**: Boetes registreren en beheren
- **Wagenparkbeheer**: Voertuigen en onderhoud beheren
- **Salarisadministratie**: Excel-export voor salarisadministratie
- **Rapportage**: Financiële rapporten en overzichten

## Tech Stack

- **Framework**: Next.js 15.3.3
- **UI**: React 18, Tailwind CSS, Shadcn UI
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **AI**: Google Genkit
- **PDF**: react-pdf, pdfjs-dist
- **Forms**: React Hook Form, Zod
- **Charts**: Recharts

## Vereisten

- Node.js 18+ 
- npm of yarn
- Supabase project
- Google Cloud API key (voor AI functionaliteit)

## Installatie

1. Clone de repository:
```bash
git clone https://github.com/McTasty-AI/RMJanssenapp.git
cd RMJanssenapp
```

2. Installeer dependencies:
```bash
npm install
```

3. Maak een `.env.local` bestand aan met de volgende variabelen:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GOOGLE_GENAI_API_KEY=your_google_genai_api_key
```

4. Database setup:
```bash
npm run db:apply
```

5. Start de development server:
```bash
npm run dev
```

De app is nu beschikbaar op `http://localhost:9002`

## Scripts

- `npm run dev` - Start development server (port 9002)
- `npm run build` - Build voor productie
- `npm run start` - Start productie server
- `npm run lint` - Run ESLint
- `npm run typecheck` - TypeScript type checking
- `npm run genkit:dev` - Start Genkit AI development server
- `npm run db:apply` - Pas database migrations toe
- `npm run admin:create` - Maak admin gebruiker aan

## Deployment op Vercel

1. Push code naar GitHub repository
2. Importeer project in Vercel
3. Voeg environment variables toe in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - `GOOGLE_GENAI_API_KEY`
4. Vercel detecteert automatisch Next.js en bouwt de applicatie

## Database Migraties

Database migraties worden beheerd via Supabase. Zie `docs/supabase/schema.sql` voor de volledige schema definitie.

## Project Structuur

```
src/
├── app/              # Next.js app router pages
├── components/       # React components
├── lib/             # Utility functions en types
├── hooks/           # Custom React hooks
├── ai/              # AI flows (Genkit)
└── components/ui/    # Shadcn UI components
```

## Licentie

Private project - Alle rechten voorbehouden
