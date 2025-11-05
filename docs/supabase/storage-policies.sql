-- Buckets en Storage policies voor RM Janssen App

-- 1) Buckets aanmaken (id == name)
insert into storage.buckets (id, name, public)
values
  ('company_assets','company_assets', true),  -- Public voor logo's die gebruikt worden in facturen en headers
  ('receipts','receipts', false),
  ('fines','fines', false),
  ('invoices','invoices', false),
  ('purchase_invoices','purchase_invoices', false),
  ('vehicle_documents','vehicle_documents', false)
on conflict (id) do nothing;

-- 2) RLS inschakelen op storage.objects
alter table storage.objects enable row level security;

-- 3) Policies
-- Helper: admin full access op alle buckets
drop policy if exists "storage admin all" on storage.objects;
create policy "storage admin all" on storage.objects
  for all using (public.is_admin()) with check (public.is_admin());

-- Receipts (declaraties):
-- - Driver: CRUD op eigen uploads (owner = auth.uid())
-- - Admin: gedekt door admin policy
drop policy if exists "receipts driver read" on storage.objects;
create policy "receipts driver read" on storage.objects
  for select using (
    bucket_id = 'receipts' and (owner = auth.uid())
  );

drop policy if exists "receipts driver insert" on storage.objects;
create policy "receipts driver insert" on storage.objects
  for insert with check (
    bucket_id = 'receipts' and (owner = auth.uid())
  );

drop policy if exists "receipts driver update" on storage.objects;
create policy "receipts driver update" on storage.objects
  for update using (
    bucket_id = 'receipts' and (owner = auth.uid())
  ) with check (
    bucket_id = 'receipts' and (owner = auth.uid())
  );

drop policy if exists "receipts driver delete" on storage.objects;
create policy "receipts driver delete" on storage.objects
  for delete using (
    bucket_id = 'receipts' and (owner = auth.uid())
  );

-- Fines (boetes):
-- - Driver: read als gekoppelde fine.user_id = auth.uid() op basis van fines.receipt_path == objects.name
drop policy if exists "fines driver read" on storage.objects;
create policy "fines driver read" on storage.objects
  for select using (
    bucket_id = 'fines' and (
      exists (
        select 1 from public.fines f where f.receipt_path = storage.objects.name and f.user_id = auth.uid()
      )
    )
  );

-- Invoices: admin-only (gedekt door admin policy)
-- Purchase invoices: admin-only (gedekt door admin policy)

-- Vehicle documents:
-- - Driver: read indien toegewezen aan voertuig op documentdatum/algemeen
drop policy if exists "vehicle_docs driver read" on storage.objects;
create policy "vehicle_docs driver read" on storage.objects
  for select using (
    bucket_id = 'vehicle_documents' and (
      exists (
        select 1
        from public.vehicle_documents vd
        join public.driver_vehicle_assignments a on a.vehicle_id = vd.vehicle_id
        where vd.storage_path = storage.objects.name
          and a.user_id = auth.uid()
          -- geen datum op document; assignment op enig moment is voldoende
      )
    )
  );

-- Optioneel: strictere insert/update/delete per bucket door alleen admin toe te staan
-- (drivers uploaden alleen receipts; boetes/invoices/purchase/vehicle docs door admin backend)
drop policy if exists "fines admin write" on storage.objects;
create policy "fines admin write" on storage.objects
  for all using (
    bucket_id = 'fines' and public.is_admin()
  ) with check (
    bucket_id = 'fines' and public.is_admin()
  );

drop policy if exists "invoices admin write" on storage.objects;
create policy "invoices admin write" on storage.objects
  for all using (
    bucket_id = 'invoices' and public.is_admin()
  ) with check (
    bucket_id = 'invoices' and public.is_admin()
  );

drop policy if exists "purchase_invoices admin write" on storage.objects;
create policy "purchase_invoices admin write" on storage.objects
  for all using (
    bucket_id = 'purchase_invoices' and public.is_admin()
  ) with check (
    bucket_id = 'purchase_invoices' and public.is_admin()
  );

drop policy if exists "vehicle_documents admin write" on storage.objects;
create policy "vehicle_documents admin write" on storage.objects
  for all using (
    bucket_id = 'vehicle_documents' and public.is_admin()
  ) with check (
    bucket_id = 'vehicle_documents' and public.is_admin()
  );

-- Company assets (bedrijfslogo):
-- - Public read access (logos moeten toegankelijk zijn voor facturen en headers)
-- - Admin-only write access
drop policy if exists "company_assets admin all" on storage.objects;
create policy "company_assets admin all" on storage.objects
  for all 
  using (
    bucket_id = 'company_assets' and public.is_admin()
  )
  with check (
    bucket_id = 'company_assets' and public.is_admin()
  );

drop policy if exists "company_assets public read" on storage.objects;
create policy "company_assets public read" on storage.objects
  for select
  using (bucket_id = 'company_assets');

