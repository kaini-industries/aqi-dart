import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getServerEnvironment } from "@/lib/env";

let client: NeonQueryFunction<false, false> | undefined;

export function hasDatabase(): boolean {
  return Boolean(getServerEnvironment().DATABASE_URL);
}

export function getDatabase(): NeonQueryFunction<false, false> {
  const { DATABASE_URL } = getServerEnvironment();

  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured. The application is running in live-data mode.",
    );
  }

  if (!client) {
    client = neon(DATABASE_URL);
  }

  return client;
}
