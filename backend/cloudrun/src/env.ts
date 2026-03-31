export function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`[env] Missing ${name}`);
  }
  return v;
}

export function getEnv(name: string, fallback = ''): string {
  const v = process.env[name];
  return v == null ? fallback : v;
}

