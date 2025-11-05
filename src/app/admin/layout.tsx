"use client";

import AdminGuard from "@/components/auth/AdminGuard";
import Header from "@/components/Header";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <AdminGuard>
        <main className="flex-1 container mx-auto p-4 md:p-8">{children}</main>
      </AdminGuard>
    </div>
  );
}
