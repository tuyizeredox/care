import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const initials = (first?: string | null, last?: string | null): string =>
  ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || '?';

export const fullName = (
  person?: { firstName?: string | null; lastName?: string | null } | null,
): string => {
  if (!person) return 'Unassigned';
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unassigned';
};

/** Deterministic avatar tint so the same person always looks the same. */
export const avatarTint = (seed: string): string => {
  const palette = [
    'bg-indigo-100 text-indigo-700',
    'bg-sky-100 text-sky-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-violet-100 text-violet-700',
    'bg-teal-100 text-teal-700',
  ];
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length];
};

export const truncate = (value: string, length: number): string =>
  value.length <= length ? value : value.slice(0, length - 1) + '…';

/** Waits for the user to stop typing before firing a search. */
export function debounce<T extends (...args: never[]) => void>(fn: T, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
