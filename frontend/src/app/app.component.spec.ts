import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AppComponent } from './app.component';
import { AuthGuard } from './core/classes/auth-guard';
import { ACTIVE_USER_STORAGE_KEY, ActiveUserService } from './core/services/active-user.service';
import { SnackBarService } from './core/services/snack-bar.service';
import { backendUrl } from './core/constants/api';

@Component({ selector: 'app-page-header', template: '' })
class HeaderStub {}

@Component({ template: '<p>Protected page</p>' })
class ProtectedPage {}

@Component({ template: '<p>User selection</p>' })
class SelectionPage {}

describe('User restoration routing and recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify({ id: 7 }));
    vi.spyOn(console, 'warn').mockReturnValue(undefined);
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideRouter([
          { path: 'protected', component: ProtectedPage, canActivate: [AuthGuard] },
          { path: 'userSelection', component: SelectionPage },
        ]),
        { provide: SnackBarService, useValue: { open: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(AppComponent, {
      set: { imports: [RouterOutlet, HeaderStub, MatButtonModule, MatProgressSpinnerModule] },
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps the requested page pending through failure and retry, then uses fresh user data', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const page: HTMLElement = fixture.nativeElement;
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpTestingController);
    const navigation = router.navigateByUrl('/protected');
    fixture.detectChanges();
    expect(page.querySelector('[role="status"]')).not.toBeNull();
    expect(page.textContent).not.toContain('Protected page');
    expect(TestBed.inject(ActiveUserService).activeUser()).toBeNull();

    http.expectOne(`${backendUrl}/users/7`).flush(null, { status: 503, statusText: 'Unavailable' });
    await vi.waitFor(() => expect(TestBed.inject(ActiveUserService).restorationState()).toBe('error'));
    fixture.detectChanges();
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
    expect(page.textContent).not.toContain('User selection');
    expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe('{"id":7}');

    page.querySelector<HTMLButtonElement>('button')?.click();
    fixture.detectChanges();
    expect(page.querySelector('[role="status"]')).not.toBeNull();
    http.expectOne(`${backendUrl}/users/7`).flush({ id: 7, username: 'Fresh name' });
    await navigation;
    fixture.detectChanges();
    expect(router.url).toBe('/protected');
    expect(page.textContent).toContain('Protected page');
    expect(TestBed.inject(ActiveUserService).activeUser()?.username).toBe('Fresh name');
    expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe('{"id":7}');
  });

  it('redirects a deleted user to selection and clears the stored ID', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const navigation = router.navigateByUrl('/protected');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${backendUrl}/users/7`)
      .flush({ detail: 'User not found' }, { status: 404, statusText: 'Not Found' });
    await navigation;
    fixture.detectChanges();
    expect(router.url).toBe('/userSelection');
    expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('User selection');
  });

  it('allows choosing another user while restoration is pending and ignores its late response', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const navigation = router.navigateByUrl('/protected');
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')?.click();
    await navigation;
    await vi.waitFor(() => expect(router.url).toBe('/userSelection'));
    TestBed.inject(HttpTestingController).expectOne(`${backendUrl}/users/7`).flush({ id: 7, username: 'Late user' });
    fixture.detectChanges();
    expect(TestBed.inject(ActiveUserService).activeUser()).toBeNull();
    expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBeNull();
  });

  it('redirects without fetching a user when no ID is stored', async () => {
    localStorage.clear();
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const navigation = router.navigateByUrl('/protected');
    fixture.detectChanges();
    await navigation;
    expect(router.url).toBe('/userSelection');
    TestBed.inject(HttpTestingController).expectNone(`${backendUrl}/users/7`);
  });
});
