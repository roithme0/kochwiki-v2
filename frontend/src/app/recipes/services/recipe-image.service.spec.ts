import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { backendUrl } from '../../core/constants/api';
import { RecipeImageService } from './recipe-image.service';
import { FoodstuffImageService } from '../../foodstuffs/services/foodstuff-image.service';
import type { Type } from '@angular/core';

type ImageClient = Pick<RecipeImageService, 'upload' | 'download'>;
const cases: { domain: string; serviceType: Type<ImageClient> }[] = [
  { domain: 'recipe', serviceType: RecipeImageService },
  { domain: 'foodstuff', serviceType: FoodstuffImageService },
];

describe.each(cases)('$domain image transfers', ({ domain, serviceType }) => {
  const uploadId = '00000000-0000-4000-8000-000000000001';
  const startUrl = `${backendUrl}/${domain}-image-uploads`;
  const completeUrl = `${startUrl}/${uploadId}/complete`;
  const storageUrl = `/storage/${domain}-images/folder/image%20%2B%25.png?X-Amz-Credential=test%2Fgarage%2Fs3&X-Amz-Signature=ABC123&opaque=a+b%2B%2F`;
  const signedUrl = `http://localhost:8002${storageUrl}`;
  const instructions = {
    uploadId,
    url: signedUrl,
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    expiresIn: 300,
  };
  const image = {
    id: '00000000-0000-4000-8000-000000000002',
    contentType: 'image/png',
    size: 3,
    width: 1,
    height: 1,
    createdAt: '2026-10-15T10:00:00Z',
  };

  describe('upload', () => {
    let service: ImageClient;
    let http: HttpTestingController;
    const file = new File(['png'], 'recipe.png', { type: 'image/png' });

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      service = TestBed.inject(serviceType);
      http = TestBed.inject(HttpTestingController);
    });
    afterEach(() => {
      try {
        http.verify();
      } finally {
        TestBed.resetTestingModule();
      }
    });

    it('uploads through the same-origin storage route preserving signed encoding before completing', async () => {
      const result = service.upload(file);
      const start = http.expectOne(startUrl);
      expect(start.request.method).toBe('POST');
      start.flush(instructions);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const transfer = http.expectOne(storageUrl);
      expect(transfer.request.method).toBe('PUT');
      expect(transfer.request.body).toBe(file);
      expect(transfer.request.headers.get('Content-Type')).toBe('image/png');
      expect(transfer.request.withCredentials).toBe(false);
      http.expectNone(completeUrl);
      transfer.flush('');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const completion = http.expectOne(completeUrl);
      expect(completion.request.method).toBe('POST');
      completion.flush(image);
      await expect(result).resolves.toEqual(image);
    });

    it.each(['start', 'transfer', 'complete'])(
      'stops at a failed %s request without retrying',
      async (stage) => {
        const result = service.upload(file);
        const rejected =
          expect(result).rejects.toBeInstanceOf(HttpErrorResponse);
        const start = http.expectOne(startUrl);
        if (stage === 'start') {
          start.flush(
            { detail: 'Unavailable' },
            { status: 503, statusText: 'Unavailable' },
          );
        } else {
          start.flush(instructions);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          const transfer = http.expectOne(storageUrl);
          if (stage === 'transfer') {
            transfer.flush('Expired', { status: 403, statusText: 'Forbidden' });
          } else {
            transfer.flush('');
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            http
              .expectOne(completeUrl)
              .flush(
                { detail: 'Unavailable' },
                { status: 503, statusText: 'Unavailable' },
              );
          }
        }
        await rejected;
        http.expectNone(startUrl);
        http.expectNone(signedUrl);
        http.expectNone(completeUrl);
      },
    );

    it('rejects malformed upload instructions before transferring bytes', async () => {
      const result = service.upload(file);
      const rejected = expect(result).rejects.toMatchObject({
        name: 'ApiContractError',
      });
      http.expectOne(startUrl).flush({ ...instructions, method: 'GET' });
      await rejected;
      http.expectNone(signedUrl);
    });

    it('rejects malformed completion metadata', async () => {
      const result = service.upload(file);
      const rejected = expect(result).rejects.toMatchObject({
        name: 'ApiContractError',
      });
      http.expectOne(startUrl).flush(instructions);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      http.expectOne(storageUrl).flush('');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      http.expectOne(completeUrl).flush({ ...image, id: 'invalid' });
      await rejected;
    });
  });

  const imageId = '00000000-0000-4000-8000-000000000001';
  const endpoint = `${backendUrl}/${domain}-images/${imageId}/download`;
  const downloadInstructions = {
    url: `/storage/${domain}-images/image.png?signature=test`,
    expiresIn: 300,
  };

  describe('download', () => {
    let service: ImageClient;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      service = TestBed.inject(serviceType);
      http = TestBed.inject(HttpTestingController);
    });
    afterEach(() => {
      try {
        http.verify();
      } finally {
        TestBed.resetTestingModule();
      }
    });

    it('requests fresh instructions on each call without downloading image bytes', async () => {
      for (const url of [
        downloadInstructions.url,
        downloadInstructions.url + '2',
      ]) {
        const result = service.download(imageId);
        const request = http.expectOne(endpoint);
        expect(request.request.method).toBe('GET');
        request.flush({ ...downloadInstructions, url });
        await expect(result).resolves.toEqual({ ...downloadInstructions, url });
      }
      http.expectNone(downloadInstructions.url);
    });

    it('routes absolute signed download URLs through the app origin without changing encoding', async () => {
      const result = service.download(imageId);
      http
        .expectOne(endpoint)
        .flush({ ...downloadInstructions, url: signedUrl });
      await expect(result).resolves.toEqual({
        ...downloadInstructions,
        url: storageUrl,
      });
      http.expectNone(signedUrl);
      http.expectNone(storageUrl);
    });

    it.each([
      'https://example.invalid/api/private',
      'javascript:alert(1)',
      'https://user:secret@example.invalid/storage/image.png',
    ])('rejects invalid storage access URL %s', async (url) => {
      const result = service.download(imageId);
      const rejected = expect(result).rejects.toThrow(
        'Invalid image storage URL',
      );
      http.expectOne(endpoint).flush({ ...downloadInstructions, url });
      await rejected;
    });

    it.each([404, 503])('surfaces HTTP %s without retrying', async (status) => {
      const result = service.download(imageId);
      const rejected = expect(result).rejects.toBeInstanceOf(HttpErrorResponse);
      http
        .expectOne(endpoint)
        .flush({ detail: 'Unavailable' }, { status, statusText: 'Error' });
      await rejected;
      http.expectNone(endpoint);
    });

    it.each([
      { expiresIn: 300 },
      { ...downloadInstructions, expiresIn: 0 },
      { ...downloadInstructions, objectKey: 'private/key' },
    ])('rejects malformed download instructions %j', async (body) => {
      const result = service.download(imageId);
      const rejected = expect(result).rejects.toMatchObject({
        name: 'ApiContractError',
      });
      http.expectOne(endpoint).flush(body);
      await rejected;
    });
  });
});
