export class ApiContractError extends Error {
  constructor(readonly endpoint: string, cause: unknown) {
    super(`Invalid response from ${endpoint}`, { cause });
    this.name = 'ApiContractError';
  }
}
