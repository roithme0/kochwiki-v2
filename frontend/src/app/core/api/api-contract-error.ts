import type { ZodMiniType } from 'zod/mini';

export class ApiContractError extends Error {
  constructor(readonly endpoint: string, cause: unknown) {
    super(`Invalid response from ${endpoint}`, { cause });
    this.name = 'ApiContractError';
  }
}

export function parseApiResponse<T>(
  schema: ZodMiniType<T>,
  body: unknown,
  endpoint: string
): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiContractError(endpoint, result.error);
  }
  return result.data;
}
