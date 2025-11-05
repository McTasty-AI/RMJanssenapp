Supabase Storage – buckets en beleid (voorstel)

- Bucket `receipts` (declaraties)
  - Bestandsnaam: `userId/yyyy/mm/<uuid>.<ext>`
  - RLS: gebruikers mogen eigen bestanden lezen/schrijven; admin alles.

- Bucket `fines`
  - Bestandsnaam: `yyyy/mm/<uuid>.<ext>`
  - RLS: admin volledige toegang; chauffeurs alleen lezen op boetes die aan hen gekoppeld zijn.

- Bucket `invoices`
  - PDF’s en eventuele bijlages per factuur: `invoiceId/<file>`
  - RLS: alleen admin.

- Bucket `purchase_invoices`
  - PDF’s/afbeeldingen van inkoopfacturen: `purchaseInvoiceId/<file>`
  - RLS: alleen admin.

- Bucket `vehicle_documents`
  - Documenten per voertuig: `vehicleId/<file>`
  - RLS: admin volledige toegang; chauffeurs lezen voor toegewezen voertuigen.

Opmerking: implementeer bucket policies met behulp van Supabase Storage Policies die corresponderen met tabellen/policies in `docs/supabase/rls.sql`.

