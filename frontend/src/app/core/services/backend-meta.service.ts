import { HttpClient } from '@angular/common/http';
import {
  inject,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { backendUrl } from '../constants/api';

@Injectable({
  providedIn: 'root',
})
export class BackendMetaService {
  private readonly httpClient = inject(HttpClient);

  private _backendVersion: WritableSignal<string | undefined> =
    signal(undefined);

  constructor() {
    void this.fetchBackendVersion();
  }

  get backendVersion(): Signal<string | undefined> {
    return this._backendVersion;
  }

  private async fetchBackendVersion(): Promise<void> {
    try {
      this._backendVersion.set(await this.getBackendVersion());
    } catch (error: unknown) {
      console.error('failed to fetch backend version: ', error);
    }
  }

  private getBackendVersion = (): Promise<string> =>
    firstValueFrom(
      this.httpClient.get(backendUrl + '/meta/version', {
        responseType: 'text',
      })
    );
}
