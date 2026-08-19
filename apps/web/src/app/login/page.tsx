'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

const schema = z.object({
  email: z.string().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  password: z.string().min(8, 'Your password is at least 8 characters.'),
});

type FormValues = z.infer<typeof schema>;

/** Development-only accounts, seeded by `npm run prisma:seed`. */
const DEMO_ACCOUNTS = [
  { label: 'Country Director', email: 'country.director@care.demo' },
  { label: 'Programme Director', email: 'programme.director@care.demo' },
  { label: 'SERVE Project Manager', email: 'serve.pm@care.demo' },
  { label: 'GESI Advisor', email: 'gesi.advisor@care.demo' },
  { label: 'Administrator', email: 'admin@care.demo' },
];

const DEMO_PASSWORD = 'Passw0rd!Demo';
const SHOW_DEMO_ACCOUNTS = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS !== 'false';

function LoginForm() {
  const { signIn, user, isLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(
    params.get('expired') ? 'Your session expired. Please sign in again.' : null,
  );

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (!isLoading && user) router.replace('/dashboard');
  }, [isLoading, user, router]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Unable to sign in. Please try again.',
      );
    }
  };

  const applyDemoAccount = (email: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', DEMO_PASSWORD, { shouldValidate: true });
  };

  return (
    <main id="main-content" className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,28rem)]">
      {/* Editorial panel: gives the sign-in page a reason to exist beyond a form. */}
      <section className="relative hidden flex-col justify-between bg-foreground p-10 text-background lg:flex">
        <Brand className="[&>span:first-child]:text-background [&>span:last-child]:border-background/25 [&>span:last-child]:text-background/70" />

        <div className="max-w-md">
          <p className="text-2xl font-semibold leading-snug tracking-[-0.015em]">
            Every task has one owner and a complete history.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-background/70">
            Know who holds a piece of work right now, who handled it before, what it is waiting
            for, and how long each step actually took.
          </p>
        </div>

        <p className="text-2xs text-background/50">
          Internal system. Authorised users only.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Brand />
          </div>

          <h1 className="mt-8 text-lg font-semibold tracking-[-0.011em] lg:mt-0">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your work email address to continue.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            {formError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/5 p-2.5 text-[13px] text-destructive"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{formError}</span>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
              />
              {errors.email ? (
                <p id="email-error" className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password')}
              />
              {errors.password ? (
                <p id="password-error" className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              ) : null}
            </div>

            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              Sign in
            </Button>
          </form>

          {SHOW_DEMO_ACCOUNTS ? (
            <div className="mt-8 border-t pt-5">
              <p className="eyebrow">Development accounts</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Demo data only. Every account uses{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  {DEMO_PASSWORD}
                </code>
                .
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => applyDemoAccount(account.email)}
                    className="rounded border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
