-- RLS policies voor RM Janssen App
-- NB: Uitgaan van Supabase (auth.uid()) in policies.

alter table profiles enable row level security;
alter table vehicles enable row level security;
alter table vehicle_documents enable row level security;
alter table driver_vehicle_assignments enable row level security;
alter table weekly_logs enable row level security;
alter table daily_logs enable row level security;
alter table declarations enable row level security;
alter table leave_requests enable row level security;
alter table fines enable row level security;
alter table customers enable row level security;
alter table customer_vehicle_assignments enable row level security;
alter table weekly_rates enable row level security;
alter table invoices enable row level security;
alter table invoice_lines enable row level security;
alter table suppliers enable row level security;
alter table purchase_invoices enable row level security;
alter table purchase_invoice_lines enable row level security;
alter table documents enable row level security;
alter table vehicle_statuses enable row level security;
alter table company_profile enable row level security;
alter table financial_settings enable row level security;
alter table toll_entries enable row level security;

-- Helpers: rol bepalen via profiel
-- Note: SET search_path prevents SQL injection via schema manipulation
-- SECURITY DEFINER is needed to bypass RLS when checking admin status
create or replace function is_admin() 
returns boolean
language sql
stable
SECURITY DEFINER
SET search_path = public, pg_temp
as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Profiles
drop policy if exists "profiles self read" on profiles;
create policy "profiles self read" on profiles
  for select using (id = auth.uid() or is_admin());

drop policy if exists "profiles admin insert" on profiles;
create policy "profiles admin insert" on profiles
  for insert with check (is_admin());

-- Allow users to provision their own profile row on first login
drop policy if exists "profiles self insert" on profiles;
create policy "profiles self insert" on profiles
  for insert with check (id = auth.uid());

drop policy if exists "profiles self_update_limited" on profiles;
create policy "profiles self_update_limited" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles admin update" on profiles;
create policy "profiles admin update" on profiles
  for update using (is_admin()) with check (is_admin());

-- Vehicles
drop policy if exists "vehicles admin all" on vehicles;
create policy "vehicles admin all" on vehicles for all using (is_admin()) with check (is_admin());
drop policy if exists "vehicles driver read assigned" on vehicles;
create policy "vehicles driver read assigned" on vehicles for select using (
  exists (
    select 1 from driver_vehicle_assignments a
    where a.vehicle_id = vehicles.id and a.user_id = auth.uid()
  )
);

-- Vehicle documents
drop policy if exists "vehicle_docs admin all" on vehicle_documents;
create policy "vehicle_docs admin all" on vehicle_documents for all using (is_admin()) with check (is_admin());
drop policy if exists "vehicle_docs driver read assigned" on vehicle_documents;
create policy "vehicle_docs driver read assigned" on vehicle_documents for select using (
  exists (
    select 1 from driver_vehicle_assignments a
    where a.vehicle_id = vehicle_documents.vehicle_id and a.user_id = auth.uid()
  )
);

-- Assignments
drop policy if exists "assignments admin all" on driver_vehicle_assignments;
create policy "assignments admin all" on driver_vehicle_assignments for all using (is_admin()) with check (is_admin());
drop policy if exists "assignments self read" on driver_vehicle_assignments;
create policy "assignments self read" on driver_vehicle_assignments for select using (user_id = auth.uid());

-- Weekly / Daily logs
drop policy if exists "weekly_logs self crud" on weekly_logs;
create policy "weekly_logs self crud" on weekly_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "weekly_logs admin read" on weekly_logs;
create policy "weekly_logs admin read" on weekly_logs for select using (is_admin());
drop policy if exists "weekly_logs admin update" on weekly_logs;
create policy "weekly_logs admin update" on weekly_logs for update using (is_admin()) with check (true);

drop policy if exists "daily_logs via weekly" on daily_logs;
create policy "daily_logs via weekly" on daily_logs
  for all using (
    exists (select 1 from weekly_logs w where w.id = daily_logs.weekly_log_id and w.user_id = auth.uid())
    or is_admin()
  ) with check (
    exists (select 1 from weekly_logs w where w.id = daily_logs.weekly_log_id and w.user_id = auth.uid())
    or is_admin()
  );

-- Declarations
drop policy if exists "declarations self crud" on declarations;
create policy "declarations self crud" on declarations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "declarations admin read" on declarations;
create policy "declarations admin read" on declarations for select using (is_admin());
drop policy if exists "declarations admin update" on declarations;
create policy "declarations admin update" on declarations for update using (is_admin()) with check (true);

-- Leave
drop policy if exists "leave self crud" on leave_requests;
create policy "leave self crud" on leave_requests for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "leave admin read" on leave_requests;
create policy "leave admin read" on leave_requests for select using (is_admin());
drop policy if exists "leave admin update" on leave_requests;
create policy "leave admin update" on leave_requests for update using (is_admin()) with check (true);

-- Fines
drop policy if exists "fines admin all" on fines;
create policy "fines admin all" on fines for all using (is_admin()) with check (is_admin());
drop policy if exists "fines driver select own_or_assigned" on fines;
create policy "fines driver select own_or_assigned" on fines for select using (
  user_id = auth.uid()
  or exists (
    select 1 from vehicles v
    join driver_vehicle_assignments a on a.vehicle_id = v.id
    where v.license_plate = fines.license_plate
      and a.user_id = auth.uid()
      and a.start_date <= fines.date
      and (a.end_date is null or a.end_date >= fines.date)
  )
);

-- Customers / Invoices / Suppliers / Purchase
drop policy if exists "customers admin all" on customers;
create policy "customers admin all" on customers for all using (is_admin()) with check (is_admin());
drop policy if exists "customer_vehicle admin all" on customer_vehicle_assignments;
create policy "customer_vehicle admin all" on customer_vehicle_assignments for all using (is_admin()) with check (is_admin());
drop policy if exists "weekly_rates admin all" on weekly_rates;
create policy "weekly_rates admin all" on weekly_rates for all using (is_admin()) with check (is_admin());

drop policy if exists "invoices admin all" on invoices;
create policy "invoices admin all" on invoices for all using (is_admin()) with check (is_admin());
drop policy if exists "invoice_lines admin all" on invoice_lines;
create policy "invoice_lines admin all" on invoice_lines for all using (is_admin()) with check (is_admin());

drop policy if exists "suppliers admin all" on suppliers;
create policy "suppliers admin all" on suppliers for all using (is_admin()) with check (is_admin());
drop policy if exists "purchase_invoices admin all" on purchase_invoices;
create policy "purchase_invoices admin all" on purchase_invoices for all using (is_admin()) with check (is_admin());
drop policy if exists "purchase_invoice_lines admin all" on purchase_invoice_lines;
create policy "purchase_invoice_lines admin all" on purchase_invoice_lines for all using (is_admin()) with check (is_admin());

-- Documents (alleen admin)
drop policy if exists "documents admin all" on documents;
create policy "documents admin all" on documents for all using (is_admin()) with check (is_admin());

-- Vehicle Statuses (admin write, authenticated read)
drop policy if exists "vehicle_statuses admin all" on vehicle_statuses;
create policy "vehicle_statuses admin all" on vehicle_statuses
  for all using (is_admin()) with check (is_admin());
drop policy if exists "vehicle_statuses authenticated read" on vehicle_statuses;
create policy "vehicle_statuses authenticated read" on vehicle_statuses
  for select using (auth.role() = 'authenticated');

-- Company Profile (admin write, authenticated read)
drop policy if exists "company_profile admin all" on company_profile;
create policy "company_profile admin all" on company_profile
  for all using (is_admin()) with check (is_admin());
drop policy if exists "company_profile authenticated read" on company_profile;
create policy "company_profile authenticated read" on company_profile
  for select using (auth.role() = 'authenticated');

-- Financial Settings (admin write, authenticated read)
drop policy if exists "financial_settings admin all" on financial_settings;
create policy "financial_settings admin all" on financial_settings
  for all using (is_admin()) with check (is_admin());
drop policy if exists "financial_settings authenticated read" on financial_settings;
create policy "financial_settings authenticated read" on financial_settings
  for select using (auth.role() = 'authenticated');

-- Toll Entries (alleen admin voor nu)
drop policy if exists "toll_entries admin all" on toll_entries;
create policy "toll_entries admin all" on toll_entries
  for all using (is_admin()) with check (is_admin());
