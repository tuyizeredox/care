'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  ArrowBigUp,
  ArrowRight,
  Eye,
  EyeOff,
  History,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  Timer,
  UserCheck,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Brand } from '@/components/brand';
import { InstallAppButton } from '@/components/pwa/install-prompt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

const schema = z.object({
  email: z.string().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  password: z.string().min(8, 'Your password is at least 8 characters.'),
});

type FormValues = z.infer<typeof schema>;

const FEATURES = [
  { icon: UserCheck, title: 'One clear owner', text: 'Each task is held by exactly one person.' },
  { icon: History, title: 'Complete history', text: 'Every handover, and why it happened.' },
  { icon: Timer, title: 'Honest timings', text: 'How long each step actually took.' },
];

/** Illustrative only: the shape of a task's journey, not real data. */
const JOURNEY = [
  { initials: 'PM', role: 'SERVE Project Manager', action: 'Drafted', time: '2d 4h' },
  { initials: 'GA', role: 'GESI Advisor', action: 'Reviewed', time: '5h 12m' },
  { initials: 'PD', role: 'Programme Director', action: 'With you now', time: null },
];

const fieldClass = 'h-11 rounded-lg bg-card pl-10 text-[15px] shadow-sm shadow-black/[0.03]';

function TaskPreview() {
  return (
    <div
      aria-hidden
      className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/40 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] tracking-wide text-white/45">TSK-1042</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          Awaiting approval
        </span>
      </div>
      <p className="mt-2 text-[15px] font-medium text-white">Quarterly GESI progress report</p>

      <ol className="relative mt-5 space-y-4">
        <span className="absolute bottom-3 left-[15px] top-3 w-px bg-gradient-to-b from-white/10 via-white/15 to-[#FF5A6E]/60" />
        {JOURNEY.map((step) => {
          const current = step.time === null;
          return (
            <li key={step.role} className="relative flex items-center gap-3">
              <span
                className={cn(
                  'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                  current
                    ? 'bg-[#D6263B] text-white ring-4 ring-[#D6263B]/20'
                    : 'border border-white/10 bg-[#1B1F27] text-white/60',
                )}
              >
                {step.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-[13px]', current ? 'font-medium text-white' : 'text-white/75')}>
                  {step.action}
                </span>
                <span className="block truncate text-[11px] text-white/40">{step.role}</span>
              </span>
              {current ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#FF8C98]">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-[#FF5A6E]/70" />
                    <span className="relative h-2 w-2 rounded-full bg-[#FF5A6E]" />
                  </span>
                  Now
                </span>
              ) : (
                <span className="tabular font-mono text-[11px] text-white/40">{step.time}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Stays dark in both themes: it is the brand surface, not part of the interface. */
function Showcase() {
  return (
    <section className="relative hidden overflow-hidden bg-[#0E1116] text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-48 h-[36rem] w-[36rem] rounded-full bg-[#D6263B]/25 blur-[120px]" />
        <div className="absolute -bottom-56 -right-40 h-[32rem] w-[32rem] rounded-full bg-[#9A1526]/30 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_40%_45%,black_20%,transparent_70%)]" />
      </div>

      <Brand tone="inverse" className="relative" />

      <div className="relative max-w-[34rem] py-8">
        <p className="text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.03em] xl:text-5xl">
          Every task has one owner and a{' '}
          <span className="bg-gradient-to-r from-[#FF9AA4] to-[#FF5A6E] bg-clip-text text-transparent">
            complete history.
          </span>
        </p>
        <p className="mt-5 max-w-md text-pretty text-[15px] leading-relaxed text-white/60">
          Know who holds a piece of work right now, who handled it before, what it is waiting for,
          and how long each step actually took.
        </p>
        <div className="mt-8 max-w-md [@media(max-height:760px)]:hidden">
          <TaskPreview />
        </div>
      </div>

      <div className="relative space-y-8">
        <ul className="grid grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <feature.icon className="h-4 w-4 text-[#FF8C98]" aria-hidden />
              <p className="mt-2.5 text-[13px] font-medium text-white">{feature.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/50">{feature.text}</p>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-2 border-t border-white/10 pt-6 text-xs text-white/40">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Internal system. Authorised users only.
        </p>
      </div>
    </section>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-full text-muted-foreground"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label="Toggle colour theme"
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}

function LoginForm() {
  const { signIn, user, isLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    params.get('expired') ? 'Your session expired. Please sign in again.' : null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const passwordField = register('password');

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

  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState('CapsLock'));

  return (
    <main id="main-content" className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Showcase />

      <section className="flex min-h-dvh flex-col">
        <header className="flex items-center gap-3 px-5 py-4 sm:px-8 sm:py-5">
          <Brand className="lg:hidden" />
          <div className="ml-auto flex items-center gap-1.5">
            <InstallAppButton />
            <ThemeToggle />
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center px-5 pb-8 sm:px-8">
          <div className="w-full max-w-[25rem] animate-fade-in">
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.022em]">
              Welcome back
            </h1>
            <p className="mt-2 text-pretty text-[15px] text-muted-foreground">
              Use your work email to pick up where you left off.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-5" noValidate>
              {formError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3.5 py-3 text-[13px] text-destructive"
                >
                  <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
                  <span>{formError}</span>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="name@organisation.org"
                    className={fieldClass}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    {...register('email')}
                  />
                </div>
                {errors.email ? (
                  <p id="email-error" className="text-xs text-destructive">
                    {errors.email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Password</Label>
                  <Popover>
                    <PopoverTrigger className="rounded text-[13px] font-medium text-primary underline-offset-4 hover:underline">
                      Forgot password?
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 rounded-lg">
                      <p className="text-sm font-medium">Ask an administrator</p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                        An administrator can reset your password. You will receive a temporary
                        one, and choose a new password the next time you sign in.
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className={cn(fieldClass, 'pr-11')}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={
                      [errors.password && 'password-error', capsLock && 'caps-lock']
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    onKeyDown={trackCapsLock}
                    onKeyUp={trackCapsLock}
                    {...passwordField}
                    onBlur={(event) => {
                      setCapsLock(false);
                      void passwordField.onBlur(event);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
                {errors.password ? (
                  <p id="password-error" className="text-xs text-destructive">
                    {errors.password.message}
                  </p>
                ) : null}
                {capsLock ? (
                  <p
                    id="caps-lock"
                    className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                  >
                    <ArrowBigUp className="h-3.5 w-3.5" aria-hidden />
                    Caps Lock is on
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                size="lg"
                className="h-11 w-full rounded-lg text-[15px] shadow-md shadow-primary/25"
                loading={isSubmitting}
              >
                {isSubmitting ? (
                  'Signing in…'
                ) : (
                  <>
                    Sign in
                    <ArrowRight aria-hidden />
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>

        <footer className="flex items-center justify-center gap-2 px-5 pb-6 text-xs text-muted-foreground lg:hidden">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Internal system. Authorised users only.
        </footer>
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
