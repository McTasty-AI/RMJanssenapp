# MCP: Supabase (Postgres)

Deze map bevat een minimale setup om een Postgres MCP‑server te koppelen aan jouw Supabase database. Zodra de client (je IDE/Codex CLI) deze MCP‑server start, kan ik de SQL uit dit project direct uitvoeren.

## Wat heb je nodig
- Node.js + npm (voor de officiële Postgres MCP server)
- Supabase Postgres connectiestring (direct connection, met SSL):
  - Supabase Dashboard → Project Settings → Database → Connection string → psql
  - Zorg dat er een database password is gezet (Database → Settings → Set password)
  - Vorm (direct): `postgres://<user>:<password>@<host>:5432/postgres?sslmode=require`
  - Vorm (pooler): `postgres://<user>:<password>@<host>:6543/postgres?sslmode=require`

**BELANGRIJK**: Als je IPv6 connectivity problemen hebt (connection timeout), gebruik dan één van deze alternatieven:
1. Gebruik Supabase Dashboard → Connection Pooling → Session mode (gebruikt een andere hostname met IPv4)
2. Controleer je firewall/network instellingen voor IPv6 toegang
3. Gebruik VPN of een ander netwerk
4. Alternatief: gebruik de bestaande `scripts/run-supabase-sql.js` script i.p.v. MCP server

## Configuratie (client)
Er zijn meerdere MCP‑clients. Hieronder 2 gangbare manieren. Kies de client die jij gebruikt en voeg de serverconfig toe met jouw DB‑URL.

### Cursor (aanbevolen)
- Settings → MCP Servers → Add server
- Name: `supabase-postgres`
- Command: `npx`
- Args: `-y`, `@modelcontextprotocol/server-postgres`
- Environment:
  - `DATABASE_URL` = `postgres://postgres:<URL-ENCODED_PASSWORD>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require`

Let op: URL‑encode speciale tekens in het wachtwoord. Voorbeeld encoding: `&` → `%26`, `+` → `%2B`, `$` → `%24`.
Voor project `msrhocbeoldpylwgccor` wordt de host `db.msrhocbeoldpylwgccor.supabase.co`.

1) Claude Desktop
- Voeg onderstaande snippet toe aan je `claude_desktop_config.json` onder `mcpServers`.
- Pas `DATABASE_URL` aan (gebruik jouw Supabase connectiestring).

```
{
 "mcpServers": {
    "supabase-postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "environment": {
        "DATABASE_URL": "postgres://<user>:<password>@<host>:5432/postgres?sslmode=require"
      }
    }
  }
}
```

2) Codex CLI / andere MCP‑clients
- Veel clients ondersteunen een vergelijkbare JSON‑config met `mcpServers`.
- Gebruik desnoods het voorbeeldbestand `docs/mcp/servers.example.json` en verwijs je client daarnaar, of kopieer de `supabase-postgres` entry naar de client‑specifieke configlocatie.

## Secret beheer
- Zet je connectiestring niet in version control.
- Optioneel: gebruik een env var en verwijs ernaar in je clientconfig (bv. `"DATABASE_URL": "${env:SUPABASE_DB_URL}"`).
- Een template staat in `docs/mcp/.env.template`.

## Wat ik daarna voor je doe
Zodra de MCP‑server actief is en zichtbaar voor mij, voer ik de SQL's uit in deze volgorde:
- `docs/supabase/schema.sql`
- `docs/supabase/rls.sql`
- `docs/supabase/storage-policies.sql`

Geef me even een seintje zodra de server draait of deel de DB‑URL, dan valideer ik de connectie en begin ik met uitvoeren.

## Status
✅ MCP Supabase server is geconfigureerd en werkend
✅ Database schema is toegepast (21 tabellen)
✅ RLS policies zijn ingeschakeld
✅ Storage buckets zijn aangemaakt
✅ Storage policies zijn geconfigureerd
✅ Security issues zijn opgelost (RLS op invoice_counters, search_path op functions, indexes toegevoegd)
