import { createClient } from '@supabase/supabase-js';

function parseArgs() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const email = args.email || process.env.ADMIN_EMAIL;
  const password = args.password || process.env.ADMIN_PASSWORD;
  const first = args.first || process.env.ADMIN_FIRST || '';
  const last = args.last || process.env.ADMIN_LAST || '';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!email || !password) {
    console.error('Usage: npm run admin:create -- --email=<email> --password=<password> [--first=Rick] [--last=Janssen]');
    process.exit(1);
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });

  console.log(`Creating auth user ${email} ...`);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error('Auth error:', error.message);
    process.exit(1);
  }
  const user = data.user;
  if (!user) {
    console.error('No user returned by Supabase.');
    process.exit(1);
  }
  console.log('Auth user id:', user.id);

  console.log('Upserting admin profile ...');
  const payload = {
    id: user.id,
    email,
    first_name: first,
    last_name: last,
    role: 'admin',
    status: 'active',
  };
  const { error: profErr } = await admin.from('profiles').upsert(payload, { onConflict: 'id' });
  if (profErr) {
    console.error('Profile error:', profErr.message);
    process.exit(1);
  }
  console.log('Done. You can now log in as admin:', email);
}

main().catch((e) => { console.error(e); process.exit(1); });

