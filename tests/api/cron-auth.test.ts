import { afterEach, describe, expect, it, vi } from "vitest";

const originalCronSecret = process.env.CRON_SECRET;

async function authorize(value?: string) {
  vi.resetModules();
  const { authorizeCronRequest } = await import("@/lib/cron/auth");
  return authorizeCronRequest(
    new Request("https://example.test/api/internal/cron/ingest", {
      headers: value ? { authorization: value } : undefined,
    }),
  );
}

afterEach(() => {
  if (originalCronSecret == null) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalCronSecret;
  }
  vi.resetModules();
});

describe("cron Bearer authorization", () => {
  it("fails closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    await expect(authorize()).resolves.toMatchObject({
      authorized: false,
      status: 503,
      code: "cron_secret_not_configured",
    });
  });

  it("rejects missing and incorrect credentials", async () => {
    process.env.CRON_SECRET = "a-secure-test-secret-value";
    await expect(authorize()).resolves.toMatchObject({
      authorized: false,
      status: 401,
    });
    await expect(authorize("Bearer incorrect-secret-value")).resolves.toMatchObject(
      {
        authorized: false,
        status: 401,
      },
    );
  });

  it("accepts the exact Bearer secret", async () => {
    process.env.CRON_SECRET = "a-secure-test-secret-value";
    await expect(
      authorize("Bearer a-secure-test-secret-value"),
    ).resolves.toEqual({ authorized: true });
  });
});
