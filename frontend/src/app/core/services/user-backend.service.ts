import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { array } from 'zod/mini';
import type { UserOut } from '../api/generated';
import { zUserOut } from '../api/generated/zod.gen';
import { requestApiResponse } from '../api/request-api-response';
import { backendUrl } from '../constants/api';

const userListSchema = array(zUserOut);

@Injectable({
  providedIn: 'root',
})
export class UserBackendService {
  private readonly httpClient = inject(HttpClient);

  getAllUsers = (): Promise<UserOut[]> =>
    requestApiResponse(this.httpClient, 'GET', backendUrl + '/users', userListSchema);

  getUserById = (userId: number): Promise<UserOut> =>
    requestApiResponse(this.httpClient, 'GET', backendUrl + '/users/' + userId, zUserOut);

}
