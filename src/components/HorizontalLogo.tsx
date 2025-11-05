
"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { CompanyProfile } from '@/lib/types';
import Image from 'next/image';

export default function HorizontalLogo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      const { data } = await supabase
        .from('company_profile')
        .select('logo_url')
        .eq('id', 'main')
        .maybeSingle();
      if (!mounted) return;
      setLogoUrl((data?.logo_url as string) || null);
    };
    fetch();
    const ch = supabase
      .channel('company-profile')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_profile' }, fetch)
      .subscribe();
    return () => { mounted = false; ch.unsubscribe(); };
  }, []);

  return (
    <div className="h-[50px] w-[200px] flex items-center justify-start">
        {logoUrl ? (
            <Image src={logoUrl} alt="Bedrijfslogo" width={200} height={50} className="object-contain object-left" unoptimized />
        ) : (
             <div className="h-full w-full bg-muted rounded-md flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Bedrijfslogo</p>
            </div>
        )}
    </div>
  );
}
