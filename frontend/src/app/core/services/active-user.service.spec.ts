import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActiveUserService } from './active-user.service';

const USER = { id: 7, display_name: 'Authenticated cook' };

describe('Authenticated current user', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.clear(); });

  async function authenticated(): Promise<ActiveUserService> {
    const service = TestBed.inject(ActiveUserService);
    const check = service.ensureSession();
    http.expectOne('/api/auth/me').flush(USER);
    await check;
    return service;
  }

  it('does not check the session merely because it is injected', () => {
    const service = TestBed.inject(ActiveUserService);
    expect(service.restorationState()).toBe('uninitialized');
    expect(service.activeUser()).toBeNull();
    http.expectNone('/api/auth/me');
  });

  it('ignores forged stored identity and accepts only the backend current user', async () => {
    localStorage.setItem('activeUser', JSON.stringify({ id: 999, display_name: 'Forged' }));
    const service = TestBed.inject(ActiveUserService);
    const check = service.ensureSession();
    expect(service.activeUser()).toBeNull();
    expect(service.restorationState()).toBe('loading');
    http.expectOne('/api/auth/me').flush(USER);
    await check;
    expect(service.activeUser()).toEqual(USER);
  });

  it('shares an in-flight check and reuses its verified result', async () => {
    const service = TestBed.inject(ActiveUserService);
    const first = service.ensureSession();
    const second = service.ensureSession();
    expect(first).toBe(second);
    http.expectOne('/api/auth/me').flush(USER);
    await Promise.all([first, second]);
    await service.ensureSession();
    http.expectNone('/api/auth/me');
    expect(service.activeUser()).toEqual(USER);
  });

  it('records a missing session without requiring navigation dependencies', async () => {
    const service = TestBed.inject(ActiveUserService);
    const check = service.ensureSession();
    http.expectOne('/api/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    await check;
    expect(service.restorationState()).toBe('signed-out');
    expect(service.activeUser()).toBeNull();
  });

  it.each([0, 403, 503])('records failure without automatically retrying status %s', async status => {
    const service = TestBed.inject(ActiveUserService);
    const check = service.ensureSession();
    http.expectOne('/api/auth/me').flush(null, { status, statusText: 'Unavailable' });
    await check;
    expect(service.restorationState()).toBe('error');
    expect(service.activeUser()).toBeNull();
    await service.ensureSession();
    http.expectNone('/api/auth/me');
  });

  it('rejects an invalid current-user response', async () => {
    const service = TestBed.inject(ActiveUserService);
    const check = service.ensureSession();
    http.expectOne('/api/auth/me').flush({ id: 7 });
    await check;
    expect(service.restorationState()).toBe('error');
    expect(service.activeUser()).toBeNull();
  });

  it.each([204, 401])('confirms logout and clears identity after status %s', async status => {
    const service = await authenticated();
    const logout = service.logout();
    expect(service.activeUser()).toEqual(USER);
    expect(service.logoutPending()).toBe(true);
    expect(await service.logout()).toBe(false);
    const request = http.expectOne('/api/auth/logout');
    expect(request.request.method).toBe('POST');
    request.flush(null, { status, statusText: status === 204 ? 'No Content' : 'Unauthorized' });
    expect(await logout).toBe(true);
    expect(service.activeUser()).toBeNull();
    expect(service.restorationState()).toBe('signed-out');
    expect(service.logoutPending()).toBe(false);
  });

  it.each([0, 403, 503])('retains identity and reports logout failure %s', async status => {
    const service = await authenticated();
    const logout = service.logout();
    http.expectOne('/api/auth/logout').flush(null, { status, statusText: 'Unavailable' });
    expect(await logout).toBe(false);
    expect(service.activeUser()).toEqual(USER);
    expect(service.restorationState()).toBe('idle');
    expect(service.logoutError()).toBe(true);
    expect(service.logoutPending()).toBe(false);
  });

  it('cannot restore identity from a late current-user response after logout', async () => {
    const service = TestBed.inject(ActiveUserService);
    const check = service.ensureSession();
    const current = http.expectOne('/api/auth/me');
    const logout = service.logout();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    expect(await logout).toBe(true);
    current.flush(USER);
    await check;
    expect(service.activeUser()).toBeNull();
    expect(service.restorationState()).toBe('signed-out');
  });
});
