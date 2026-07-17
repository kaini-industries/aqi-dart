import type {
  AirNowFetchedFile,
  AirNowFileDescriptor,
} from "./types";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class AirNowHttpError extends Error {
  readonly status: number;
  readonly descriptor: AirNowFileDescriptor;

  constructor(descriptor: AirNowFileDescriptor, status: number) {
    super(`AirNow returned HTTP ${status} for ${descriptor.filename}`);
    this.name = "AirNowHttpError";
    this.status = status;
    this.descriptor = descriptor;
  }
}

export interface FetchAirNowFileOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  signal?: AbortSignal;
  now?: () => Date;
}

export async function fetchAirNowHourlyFile(
  descriptor: AirNowFileDescriptor,
  options: FetchAirNowFileOptions = {},
): Promise<AirNowFetchedFile> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("AirNow fetch timeout must be positive");
  }

  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    forwardAbort();
  } else {
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
  }
  const timeout = setTimeout(
    () => controller.abort(new Error("AirNow fetch timed out")),
    timeoutMs,
  );

  try {
    const response = await fetchImpl(descriptor.url, {
      method: "GET",
      headers: {
        accept: "text/plain,text/csv;q=0.9,*/*;q=0.1",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AirNowHttpError(descriptor, response.status);
    }

    return {
      descriptor,
      body: await response.text(),
      fetchedAt: (options.now?.() ?? new Date()).toISOString(),
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
