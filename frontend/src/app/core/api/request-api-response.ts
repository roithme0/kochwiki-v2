import type { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ZodMiniType } from 'zod/mini';
import { ApiContractError } from './api-contract-error';

export async function requestApiResponse<T>(
  httpClient: HttpClient,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  schema: ZodMiniType<T>,
  options: { body?: unknown } = {}
): Promise<T> {
  const body = await firstValueFrom(httpClient.request<unknown>(method, url, options));
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiContractError(`${method} ${url}`, result.error);
  }
  return result.data;
}
