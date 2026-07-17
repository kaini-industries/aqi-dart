import { z } from "zod";

const optionalUrl = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .pipe(z.url().optional());

const serverEnvironmentSchema = z.object({
  DATABASE_URL: optionalUrl,
  CRON_SECRET: z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.string().min(16).optional()),
  AIRNOW_BASE_URL: optionalUrl.default("https://files.airnowtech.org"),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

let cachedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  if (cachedEnvironment) {
    return cachedEnvironment;
  }

  cachedEnvironment = serverEnvironmentSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    CRON_SECRET: process.env.CRON_SECRET ?? "",
    AIRNOW_BASE_URL:
      process.env.AIRNOW_BASE_URL ?? "https://files.airnowtech.org",
  });

  return cachedEnvironment;
}

export function getDataMode(): "database" | "live" {
  return getServerEnvironment().DATABASE_URL ? "database" : "live";
}

export const DEFAULT_MAP_STYLE_URL =
  "https://tiles.openfreemap.org/styles/positron";
