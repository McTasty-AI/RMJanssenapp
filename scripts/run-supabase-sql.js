const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// In sommige Windows/NPM omgevingen kan de Supabase cert chain self-signed lijken.
// Zet TLS verificatie uit voor deze run om connectie mogelijk te maken.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  const dsn = process.argv[2] || process.env.DATABASE_URL;
  if (!dsn) {
    console.error('ERROR: Provide DATABASE_URL via env or as argv[2].');
    process.exit(1);
  }

  const files = [
    'docs/supabase/schema.sql',
    'docs/supabase/rls.sql',
    'docs/supabase/storage-policies.sql',
  ];

  const client = new Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    let hadErrors = false;
    for (const rel of files) {
      const filePath = path.resolve(process.cwd(), rel);
      console.log(`\n==> Running ${rel} ...`);
      const sql = fs.readFileSync(filePath, 'utf8');
      try {
        await client.query(sql);
        console.log(`✓ Completed ${rel}`);
      } catch (err) {
        hadErrors = true;
        console.error(`\nExecution failed for ${rel}.`);
        if (err) {
          console.error(err.message || err);
          if (err.position) console.error('Error position:', err.position);
          if (err.where) console.error('Where:', err.where);
        }
        // Continue with next file so partial migrations don't block
      }
    }
    if (hadErrors) {
      console.log('\nCompleted with warnings. Some SQL files failed; see logs above.');
    } else {
      console.log('\nAll SQL files executed successfully.');
    }
  } catch (err) {
    console.error('\nExecution failed.');
    if (err) {
      console.error(err.message || err);
      if (err.position) console.error('Error position:', err.position);
      if (err.where) console.error('Where:', err.where);
    }
    process.exit(1);
  } finally {
    try { await client.end(); } catch (_) {}
  }
}

main();
