import { timingSafeEqual } from "node:crypto";

import { getServerEnvironment } from "@/lib/env";

export type CronAuthorizationResult =
  | { authorized: true }
  | {
      authorized: false;
      status: 401 | 503;
      code: "unauthorized" | "cron_secret_not_configured";
      message: string;
    };

function secretsMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function authorizeCronRequest(
  request: Pick<Request, "headers">,
): CronAuthorizationResult {
  const { CRON_SECRET } = getServerEnvironment();
  if (!CRON_SECRET) {
    return {
      authorized: false,
      status: 503,
      code: "cron_secret_not_configured",
      message: "CRON_SECRET must be configured before collection can run.",
    };
  }

  const authorization = request.headers.get("authorization");
  const expectedPrefix = "Bearer ";
  if (
    !authorization?.startsWith(expectedPrefix) ||
    !secretsMatch(authorization.slice(expectedPrefix.length), CRON_SECRET)
  ) {
    return {
      authorized: false,
      status: 401,
      code: "unauthorized",
      message: "A valid Bearer token is required.",
    };
  }

  return { authorized: true };
}
