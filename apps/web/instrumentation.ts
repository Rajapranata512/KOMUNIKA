export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { installServerApiProtectionBypass } = await import('./server-api-protection');
  installServerApiProtectionBypass();
}
