export const passwordRules = {
  length: (p: string) => p.length >= 8,
  upper: (p: string) => /[A-Z]/.test(p),
  lower: (p: string) => /[a-z]/.test(p),
  number: (p: string) => /[0-9]/.test(p),
};

export function isStrongPassword(p: string) {
  return Object.values(passwordRules).every((r) => r(p));
}

/** A scheduled time is valid only when strictly in the future. */
export function isFutureSchedule(date: Date, now = new Date()) {
  return !Number.isNaN(date.getTime()) && date.getTime() > now.getTime();
}
