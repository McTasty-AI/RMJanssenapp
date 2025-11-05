-- RM Janssen App – Supabase/Postgres schema voorstel
-- Dit schema dekt: profielen (chauffeurs/admins), voertuigen, toewijzingen,
-- week-/dagstaten, declaraties, verlof, boetes, klanten & tarieven,
-- verkoopfacturen, leveranciers & inkoopfacturen, documenten en ondersteunende tabellen.

-- Extensions
create extension if not exists pgcrypto;

-- =====================================================
-- Enums
-- =====================================================
do language plpgsql $$ begin
  create type day_status as enum (
    'gewerkt','ziek','vrij','ouderschapsverlof','weekend','feestdag','atv','persoonlijk','onbetaald'
  );
exception when duplicate_object then null; end $$;

do language plpgsql $$ begin
  create type weekly_log_status as enum ('concept','pending','approved');
exception when duplicate_object then null; end $$;

do language plpgsql $$ begin
  create type user_role as enum ('admin','user');
exception when duplicate_object then null; end $$;

do language plpgsql $$ begin
  create type user_status as enum ('active','inactive');
exception when duplicate_object then null; end $$;

do language plpgsql $$ begin
  create type declaration_status as enum ('pending','approved','rejected','paid');
exception when duplicate_object then null; end $$;

do language plpgsql $$ begin
  create type leave_type as enum ('vakantie','atv','persoonlijk','onbetaald');
exception when duplicate_object then null; end $$;

do language plpgsql $$ begin
  create type leave_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do language plpgsql $$ begin
  create type fine_paid_by as enum ('company','driver');
exception when duplicate_object then null; end $$;

do language plpgsql $$ begin
  create type billing_type as enum ('hourly','mileage','combined');
exception when duplicate_object then null; end $$;

do language plpgsql $$ begin
  create type mileage_rate_type as enum ('fixed','variable','dot');
exception when duplicate_object then null; end $$;

do language plpgsql $$ begin
  create type purchase_invoice_status as enum ('Nieuw','Verwerkt','Betaald');
exception when duplicate_object then null; end $$;

do language plpgsql $$ begin
  create type purchase_invoice_category as enum (
    'gepland onderhoud','ongepland onderhoud','schade','brandstof','huur','verzekering','leasekosten','overig'
  );
exception when duplicate_object then null; end $$;

-- =====================================================
-- Accounts & Profielen
-- =====================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  first_name text,
  last_name text,
  role user_role not null default 'user',
  status user_status not null default 'active',

  -- Dienstverband
  salary_scale_group text,
  salary_scale_step integer,
  employment_type text,
  contract_hours numeric,
  -- alle waarden in work_days moeten behoren tot deze whitelist
  work_days text[] check (
    work_days is null or work_days <@ ARRAY['maandag','dinsdag','woensdag','donderdag','vrijdag']::text[]
  ),

  -- Reiskosten
  home_street text,
  home_house_number text,
  home_postal_code text,
  home_city text,
  station text,
  has_travel_allowance boolean default false,
  travel_distance numeric,
  travel_allowance_rate numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helper: updated_at trigger function
create or replace function public.set_current_timestamp_updated_at()
returns trigger as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$ language plpgsql;

-- Make trigger creation idempotent on re-runs
drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
before update on profiles
for each row execute procedure public.set_current_timestamp_updated_at();

-- =====================================================
-- Voertuigen & toewijzingen
-- =====================================================
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  license_plate text not null unique,
  make text,
  model text,
  status text,
  created_at timestamptz not null default now(),
  last_known_mileage numeric,

  -- Financials
  purchase_value numeric,
  purchase_date date,
  monthly_lease_amount numeric,
  outstanding_depreciation numeric
);

create table if not exists vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists driver_vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now()
);
create index if not exists driver_vehicle_assignments_user_idx on driver_vehicle_assignments(user_id);
create index if not exists driver_vehicle_assignments_vehicle_idx on driver_vehicle_assignments(vehicle_id);

-- =====================================================
-- Week-/dagstaten (uren, km, tol, overnachtingen)
-- =====================================================
create table if not exists weekly_logs (
  id uuid primary key default gen_random_uuid(),
  week_id text not null, -- bijv. '2025-42'
  user_id uuid not null references profiles(id) on delete cascade,
  remarks text,
  status weekly_log_status not null default 'concept',
  submitted_at timestamptz,
  year_month text, -- bijv. '2025-10'
  created_at timestamptz not null default now()
);
create unique index if not exists weekly_logs_unique on weekly_logs(week_id, user_id);

create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  weekly_log_id uuid not null references weekly_logs(id) on delete cascade,
  date date not null,
  day_name text,
  status day_status not null,
  start_time time,
  end_time time,
  break_time interval,
  start_mileage numeric,
  end_mileage numeric,
  toll text, -- 'Geen' | 'BE' | 'DE' | 'BE/DE'
  license_plate text,
  overnight_stay boolean default false,
  trip_number text
);
create index if not exists daily_logs_weekly_idx on daily_logs(weekly_log_id);
create index if not exists daily_logs_date_idx on daily_logs(date);

-- =====================================================
-- Declaraties & Verlof
-- =====================================================
create table if not exists declarations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  amount numeric not null,
  reason text not null,
  receipt_path text not null, -- Supabase Storage path
  status declaration_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  rejection_reason text,
  is_toll boolean default false
);
create index if not exists declarations_user_idx on declarations(user_id);

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  type leave_type not null,
  reason text,
  status leave_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  rejection_reason text
);
create index if not exists leave_user_idx on leave_requests(user_id);

-- =====================================================
-- Boetes
-- =====================================================
create table if not exists fines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  license_plate text,
  date date not null,
  amount numeric not null,
  reason text,
  paid_by fine_paid_by not null default 'company',
  receipt_path text,
  created_at timestamptz not null default now(),
  matched_at timestamptz,
  match_method text -- 'auto' | 'manual'
);
create index if not exists fines_date_idx on fines(date);
create index if not exists fines_license_idx on fines(license_plate);

-- Automatische matching van boete -> chauffeur o.b.v. kenteken + datum
create or replace function assign_fine_to_driver()
returns trigger as $$
declare
  v_vehicle_id uuid;
  v_user_id uuid;
begin
  if new.license_plate is null then
    return new;
  end if;

  select id into v_vehicle_id from vehicles where license_plate = new.license_plate;
  if v_vehicle_id is null then
    return new;
  end if;

  select a.user_id into v_user_id
  from driver_vehicle_assignments a
  where a.vehicle_id = v_vehicle_id
    and a.start_date <= new.date
    and (a.end_date is null or a.end_date >= new.date)
  order by a.start_date desc
  limit 1;

  if v_user_id is not null then
    new.user_id := v_user_id;
    new.vehicle_id := v_vehicle_id;
    new.matched_at := now();
    new.match_method := coalesce(new.match_method, 'auto');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assign_fine_to_driver on fines;
create trigger trg_assign_fine_to_driver
before insert or update of license_plate, date on fines
for each row
execute procedure assign_fine_to_driver();

-- =====================================================
-- Klanten, tariefprofielen & kenteken-koppeling
-- =====================================================
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  kvk_number text,
  street text,
  house_number text,
  postal_code text,
  city text,
  contact_name text,
  contact_email text,
  created_at timestamptz not null default now(),
  payment_term integer default 30,
  show_daily_totals boolean default false,
  show_weekly_totals boolean default false,
  show_work_times boolean default false,

  -- Financieel
  billing_type billing_type,
  mileage_rate_type mileage_rate_type,
  hourly_rate numeric,
  mileage_rate numeric,
  overnight_rate numeric,
  daily_expense_allowance numeric,
  saturday_surcharge integer,
  sunday_surcharge integer
);

-- App expects an array of assigned license plates on customers
alter table if exists customers
  add column if not exists assigned_license_plates text[];

-- Relatie: klant <-> voertuig (met geldigheidsperiode)
create table if not exists customer_vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  start_date date not null,
  end_date date
);
create index if not exists customer_vehicle_assignments_cust_idx on customer_vehicle_assignments(customer_id);
create index if not exists customer_vehicle_assignments_vehicle_idx on customer_vehicle_assignments(vehicle_id);

-- Wekelijkse variabele tarieven per klant
create table if not exists weekly_rates (
  id uuid primary key default gen_random_uuid(),
  week_id text not null, -- 'YYYY-WW'
  customer_id uuid not null references customers(id) on delete cascade,
  rate numeric not null
);
create unique index if not exists weekly_rates_unique on weekly_rates(week_id, customer_id);

-- =====================================================
-- Verkoopfacturen
-- =====================================================
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text,
  status text not null default 'concept', -- 'concept' | 'open' | 'paid' | 'credit'
  customer_id uuid not null references customers(id) on delete restrict,
  invoice_date date not null default current_date,
  due_date date,
  reference text,
  sub_total numeric not null default 0,
  vat_total numeric not null default 0,
  grand_total numeric not null default 0,
  created_at timestamptz not null default now(),
  footer_text text,
  show_daily_totals boolean default false,
  show_weekly_totals boolean default false,
  show_work_times boolean default false
);

create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  quantity numeric not null default 0,
  description text not null,
  unit_price numeric not null default 0,
  vat_rate numeric not null default 21,
  total numeric not null default 0
);
create index if not exists invoice_lines_invoice_idx on invoice_lines(invoice_id);

-- Factuurnummer generator (increment per jaar)
create table if not exists invoice_counters (
  year integer primary key,
  last_number integer not null default 0
);

create or replace function next_invoice_number()
returns text as $$
declare
  y integer := extract(year from current_date)::int;
  n integer;
begin
  insert into invoice_counters(year, last_number)
  values (y, 0)
  on conflict(year) do nothing;

  update invoice_counters
  set last_number = last_number + 1
  where year = y
  returning last_number into n;

  return lpad(n::text, 5, '0') || '/' || y::text;
end;
$$ language plpgsql;

-- =====================================================
-- Company Profile (singleton)
-- =====================================================
create table if not exists company_profile (
  id text primary key default 'main',
  company_name text,
  street text,
  house_number text,
  postal_code text,
  city text,
  email text,
  phone text,
  kvk_number text,
  vat_number text,
  iban text,
  logo_url text,
  policy_text text
);

-- =====================================================
-- Vehicle Statuses (managed list)
-- =====================================================
create table if not exists vehicle_statuses (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  is_default boolean not null default false
);

-- Add assigned plates to profiles if missing
alter table if exists profiles
  add column if not exists assigned_license_plates text[];

-- =====================================================
-- Leveranciers & Inkoopfacturen
-- =====================================================
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  kvk_number text,
  vat_number text,
  street text,
  house_number text,
  postal_code text,
  city text,
  iban text,
  contact_name text,
  contact_email text,
  created_at timestamptz not null default now()
);

create table if not exists purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete restrict,
  invoice_number text,
  invoice_date date,
  due_date date,
  status purchase_invoice_status not null default 'Nieuw',
  total numeric,
  vat_total numeric,
  license_plate text,
  vehicle_id uuid references vehicles(id) on delete set null,
  category purchase_invoice_category,
  pdf_path text,
  created_at timestamptz not null default now()
);

create table if not exists purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_invoice_id uuid not null references purchase_invoices(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  vat_rate numeric not null default 21,
  total numeric not null default 0,
  category purchase_invoice_category
);
create index if not exists purchase_lines_invoice_idx on purchase_invoice_lines(purchase_invoice_id);

-- Attempt to auto-link purchase invoice to vehicle when kenteken is aanwezig
create or replace function link_purchase_invoice_vehicle()
returns trigger as $$
declare v_vehicle_id uuid; begin
  if new.license_plate is null then return new; end if;
  select id into v_vehicle_id from vehicles where license_plate = new.license_plate;
  if v_vehicle_id is not null then new.vehicle_id := v_vehicle_id; end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_link_purchase_vehicle on purchase_invoices;
create trigger trg_link_purchase_vehicle
before insert or update of license_plate on purchase_invoices
for each row execute procedure link_purchase_invoice_vehicle();

-- =====================================================
-- Financial Settings (singleton)
-- =====================================================
create table if not exists financial_settings (
  id text primary key default 'main',
  start_balance numeric,
  start_date date
);

-- =====================================================
-- Documenten (generiek)
-- =====================================================
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null, -- 'invoice' | 'purchase_invoice' | 'vehicle' | 'fine' | ...
  entity_id uuid not null,
  storage_path text not null,
  original_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists documents_entity_idx on documents(entity_type, entity_id);

-- =====================================================
-- Views / Rapportages (voorbeeld: kosten per voertuig)
-- =====================================================
create or replace view vehicle_costs as
select v.id as vehicle_id,
       v.license_plate,
       coalesce(sum(pil.total),0) as total_costs
from vehicles v
left join purchase_invoices pi on pi.vehicle_id = v.id
left join purchase_invoice_lines pil on pil.purchase_invoice_id = pi.id
group by v.id, v.license_plate;

-- =====================================================
-- RLS wordt geconfigureerd in rls.sql
-- =====================================================
