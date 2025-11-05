# Firebase naar Supabase Functie Mapping

## Database Operaties

### Imports
```typescript
// Firebase
import { collection, doc, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Supabase
import { supabase } from '@/lib/supabase/client';
import { mapAppToSupabase, mapSupabaseToApp } from '@/lib/utils';
```

### CREATE (insert)
```typescript
// Firebase
await addDoc(collection(db, 'users'), data);

// Supabase
const mappedData = mapAppToSupabase(data);
await supabase.from('users').insert(mappedData);
```

### READ (select)
```typescript
// Firebase
const docRef = doc(db, 'users', userId);
const docSnap = await getDoc(docRef);
const data = docSnap.data();

// Supabase
const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
const mappedData = mapSupabaseToApp(data);
```

### UPDATE
```typescript
// Firebase
await updateDoc(doc(db, 'users', userId), { status: 'active' });

// Supabase
const mappedData = mapAppToSupabase({ status: 'active' });
await supabase
    .from('users')
    .update(mappedData)
    .eq('id', userId);
```

### DELETE
```typescript
// Firebase
await deleteDoc(doc(db, 'users', userId));

// Supabase
await supabase
    .from('users')
    .delete()
    .eq('id', userId);
```

### QUERY
```typescript
// Firebase
const q = query(
    collection(db, 'users'),
    where('role', '==', 'admin'),
    orderBy('createdAt', 'desc')
);
const snapshot = await getDocs(q);

// Supabase
const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'admin')
    .order('created_at', { ascending: false });
const mappedData = data?.map(mapSupabaseToApp);
```

### REALTIME SUBSCRIPTIONS
```typescript
// Firebase
const unsubscribe = onSnapshot(query(collection(db, 'users')), (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data());
});

// Supabase
const channel = supabase
    .channel('users-changes')
    .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'users'
    }, (payload) => {
        // Handle change
    })
    .subscribe();
```

## Field Name Mapping

Supabase gebruikt snake_case, app gebruikt camelCase:

| Supabase (snake_case) | App (camelCase) |
|----------------------|-----------------|
| user_id | userId |
| first_name | firstName |
| last_name | lastName |
| created_at | createdAt |
| updated_at | updatedAt |
| submitted_at | submittedAt |
| start_date | startDate |
| end_date | endDate |
| license_plate | licensePlate |
| start_mileage | startMileage |
| end_mileage | endMileage |
| overnight_stay | overnightStay |
| receipt_path | receiptPath |
| invoice_number | invoiceNumber |
| customer_id | customerId |
| week_id | weekId |
| year_month | yearMonth |

## Collection → Table Mapping

| Firestore Collection | Supabase Table |
|---------------------|----------------|
| users | profiles |
| truckLogs | weekly_logs |
| dailyLogs | daily_logs |
| declarations | declarations |
| leaveRequests | leave_requests |
| fines | fines |
| vehicles | vehicles |
| customers | customers |
| suppliers | suppliers |
| invoices | invoices |
| invoiceLines | invoice_lines |
| purchaseInvoices | purchase_invoices |
| purchaseInvoiceLines | purchase_invoice_lines |
| weeklyRates | weekly_rates |

## Storage Operaties

### Upload
```typescript
// Firebase
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
const storageRef = ref(storage, `path/${fileName}`);
await uploadBytes(storageRef, file);
const url = await getDownloadURL(storageRef);

// Supabase (nu via /api/upload)
const formData = new FormData();
formData.append('file', file);
formData.append('path', 'declarations/userId');
const response = await fetch('/api/upload', { method: 'POST', body: formData });
const { url } = await response.json();
```

## Batches

```typescript
// Firebase
import { writeBatch } from 'firebase/firestore';
const batch = writeBatch(db);
batch.set(doc(db, 'users', id1), data1);
batch.set(doc(db, 'users', id2), data2);
await batch.commit();

// Supabase - Use array insert
await supabase.from('users').insert([data1, data2]);
```











