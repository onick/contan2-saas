import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  BUILD_SHA: z.string().optional(),
  // Email de credencial (Resend). Todas OPCIONALES: sin RESEND_API_KEY el envío
  // entra en dry-run (se genera la credencial pero NO se envía ni se marca
  // credential_sent_at). EMAIL_FROM cae a un remitente de prueba si no se setea.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),
  // Directorio raíz de uploads (portadas de actividad). AISLAMIENTO de volúmenes:
  //   staging → volumen PROPIO /data/contan2-v2-staging/uploads (jamás el de prod)
  //   prod    → /data/contan2/uploads (compat con imágenes v1)
  // ambos montados en /app/uploads. En dev/tests, un directorio temporal. NO se
  // asume que exista: la capa de storage falla claro si no es escribible. La
  // compat legacy se valida en prod o en una copia controlada del volumen prod,
  // nunca compartiendo el volumen prod con staging. Sin setear → temporal de dev.
  UPLOADS_DIR: z.string().optional(),
  // Rate-limit distribuido (Redis). OPCIONAL: sin REDIS_URL el limiter cae a
  // in-memory (single-instance, se reinicia en redeploy). Con REDIS_URL, el
  // contador se comparte entre réplicas y persiste a redeploys. No se despliega
  // Redis aún; esto sólo habilita el backend cuando exista la infra.
  REDIS_URL: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
