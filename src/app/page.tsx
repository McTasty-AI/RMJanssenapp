import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get('rmj_at')?.value;
  if (token) {
    redirect('/dashboard');
  }
  redirect('/login');
}
