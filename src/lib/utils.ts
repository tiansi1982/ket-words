import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Integer percentage with divide-by-zero guard, e.g. pct(3, 10) → 30
export function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}
