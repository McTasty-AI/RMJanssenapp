"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { LoginFormData } from "@/lib/schemas";
import { loginSchema } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Logo from "@/components/Logo";
import { supabase } from '@/lib/supabase/client';
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: LoginFormData) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      console.log('[login] Submitting credentials...');

      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        let description = "Email of wachtwoord is onjuist.";
        if (error.message.includes('Invalid login credentials')) {
          description = "De combinatie van email en wachtwoord is niet gevonden.";
        } else if (error.message.includes('Invalid email')) {
          description = "Ongeldig emailadres.";
        }
        toast({ variant: "destructive", title: "Fout bij inloggen", description });
        return;
      }

      const sessionToken = signInData?.session?.access_token || (await supabase.auth.getSession()).data.session?.access_token;
      if (sessionToken) {
        // sync cookie early so middleware/pages can proceed immediately
        try { await fetch('/api/auth/sync', { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}` }, keepalive: true }); } catch {}
      }

      // Try to ensure profile exists, but never block UI.
      try {
        console.log('[login] Provisioning profile…');
        const controller = new AbortController();
        const resp = await Promise.race([
          fetch('/api/profiles/self-provision', {
            method: 'POST',
            headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : undefined,
            signal: controller.signal,
          }),
          new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000)) as any,
        ]);
        if (!resp || !resp.ok) {
          let details: any = undefined;
          try { details = await (resp as Response).json(); } catch {}
          console.warn('[login] Provisioning failed:', details || resp?.statusText || 'Timeout');
        }
      } catch (e) {
        console.warn('[login] Provisioning error:', e);
      }

      console.log('[login] Navigating to dashboard…');
      router.replace('/dashboard');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Fout bij inloggen', description: error?.message || 'Er is een onverwachte fout opgetreden.' });
    } finally {
      // Always re-enable the button after a short delay to let navigation happen
      setTimeout(() => setIsSubmitting(false), 300);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
           <Logo />
          <CardTitle className="text-2xl pt-4">Welkom terug</CardTitle>
          <CardDescription>
            Log in op uw account om verder te gaan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emailadres</FormLabel>
                    <FormControl>
                      <Input placeholder="u@voorbeeld.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wachtwoord</FormLabel>
                     <div className="relative">
                        <FormControl>
                          <Input type={showPassword ? "text" : "password"} placeholder="Wachtwoord" {...field} />
                        </FormControl>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? "Verberg wachtwoord" : "Toon wachtwoord"}
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                     </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isSubmitting}>
                {isSubmitting ? 'Bezig met inloggen...' : 'Inloggen'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}


