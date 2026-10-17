import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { backendUrl } from '../../core/constants/api';
import { RecipeImageService } from './recipe-image.service';

const uploadId = '00000000-0000-4000-8000-000000000001';
const startUrl = backendUrl + '/recipe-image-uploads';
const completeUrl = `${startUrl}/${uploadId}/complete`;
const signedUrl =
  'http://localhost:8002/storage/recipe-images/temporary?signature=test';
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

describe('RecipeImageService upload', () => {
  let service: RecipeImageService;
  let http: HttpTestingController;
  const file = new File(['png'], 'recipe.png', { type: 'image/png' });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RecipeImageService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('sends raw file bytes with the prescribed headers before completing', async () => {
    const result = service.upload(file);
    const start = http.expectOne(startUrl);
    expect(start.request.method).toBe('POST');
    start.flush(instructions);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const transfer = http.expectOne(signedUrl);
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
      const rejected = expect(result).rejects.toBeInstanceOf(HttpErrorResponse);
      const start = http.expectOne(startUrl);
      if (stage === 'start') {
        start.flush(
          { detail: 'Unavailable' },
          { status: 503, statusText: 'Unavailable' },
        );
      } else {
        start.flush(instructions);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const transfer = http.expectOne(signedUrl);
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
    http.expectOne(signedUrl).flush('');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    http.expectOne(completeUrl).flush({ ...image, id: 'invalid' });
    await rejected;
  });
});

const imageId = '00000000-0000-4000-8000-000000000001';
const endpoint = `${backendUrl}/recipe-images/${imageId}/download`;
const downloadInstructions = {
  url: '/storage/recipe-images/image.png?signature=test',
  expiresIn: 300,
};

describe('RecipeImageService download', () => {
  let service: RecipeImageService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RecipeImageService);
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
