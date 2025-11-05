# MCP Server Troubleshooting Guide

## Problem: Connection Timeout (IPv6)

### Symptomen
- MCP server start wel maar kan niet verbinden
- Error: `connect ETIMEDOUT [IPv6 address]:5432`
- Test-NetConnection faalt voor beide poorten (5432 en 6543)

### Diagnose
```powershell
# Check DNS resolutie
Resolve-DnsName -Name db.msrhocbeoldpylwgccor.supabase.co

# Test connectiviteit
Test-NetConnection -ComputerName db.msrhocbeoldpylwgccor.supabase.co -Port 5432
```

### Oorzaak
Supabase gebruikt IPv6-adressen die niet bereikbaar zijn vanuit jouw netwerk. Mogelijke redenen:
- Firewall blokkeert IPv6
- ISP/hotel/WiFi ondersteunt geen IPv6
- Netwerk configuratie probleem

### Oplossingen

#### 1. Gebruik Supabase Connection Pooler (aanbevolen)
Supabase biedt een "Connection Pooling" optie die vaak wel werkt:

1. Ga naar Supabase Dashboard → Settings → Database
2. Zoek naar "Connection Pooling" 
3. Gebruik de "Transaction" of "Session" mode URL
4. Deze hostname (`pooler.supabase.com`) ondersteunt vaak wel IPv4

Voorbeeld URL:
```
postgres://postgres:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

#### 2. Check Supabase Project Settings
In Supabase Dashboard → Settings → Database → Connection string:
- Probeer beide opties: "Direct connection" en "Connection pooling"
- Kopieer de volledige connection string van daar
- Deze bevat mogelijk een andere hostname die wel werkt

#### 3. Alternatief: Gebruik bestaand script
De MCP server werkt niet door network issues, maar je hebt al een werkend alternatief:

```bash
# Gebruik het bestaande script
node scripts/run-supabase-sql.js
```

Dit script gebruikt dezelfde connection string maar werkt mogelijk beter met jouw netwerk configuratie.

#### 4. Netwerk troubleshooting
- Probeer een andere internetverbinding (mobile hotspot, ander WiFi netwerk)
- Disable IPv6 op je netwerk adapter (Windows: Network Settings → Adapter Properties → uncheck IPv6)
- Contact je IT/netwerk administrator
- Gebruik VPN met IPv4 support

#### 5. Test vanaf ander apparaat/netwerk
Test of het probleem specifiek is voor jouw huidige netwerk:
- Probeer dezelfde connection string vanaf een ander apparaat
- Test vanaf een ander netwerk (bv. thuis vs. kantoor)

### MCP Server Configuratie (Cursor)

Als je een werkende connection string hebt gevonden, configureer de MCP server in Cursor:

1. Settings → MCP Servers → Add server
2. Name: `supabase-postgres`
3. Command: `npx`
4. Args: `-y`, `@modelcontextprotocol/server-postgres`
5. Environment Variables:
   - Key: `DATABASE_URL`
   - Value: jouw werkende connection string

### Verificatie

Zodra de MCP server werkt, kan ik queries uitvoeren:
```sql
SELECT version();
```

Als dit werkt, voer ik daarna automatisch de SQL files uit:
- `docs/supabase/schema.sql`
- `docs/supabase/rls.sql`
- `docs/supabase/storage-policies.sql`




