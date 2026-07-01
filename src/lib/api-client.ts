interface ApiErrorBody {
  error?: string;
}

export async function readJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

export function getApiErrorMessage(
  res: Response,
  body: ApiErrorBody,
  fallback: string,
) {
  const retryAfter = res.headers.get("Retry-After");
  const message = body.error ?? fallback;

  if (res.status === 429 && retryAfter) {
    return `${message} Try again in ${retryAfter} seconds.`;
  }

  return message;
}
