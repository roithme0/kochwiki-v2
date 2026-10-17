import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AppComponent } from './app.component';
import { AuthGuard } from './core/classes/auth-guard';
import { ActiveUserService } from './core/services/active-user.service';
import { AuthNavigationService } from './core/services/auth-navigation.service';
import { SignedOutPageComponent } from './core/pages/signed-out-page/signed-out-page.component';
import { routes } from './app.routes';

@Component({
  selector: 'app-page-header',
  template: '<p>Authenticated header</p>',
})
class HeaderStub {}
@Component({ template: '<p>Protected page</p>' })
class ProtectedPage {}

describe('Session-gated application routing', () => {
  const navigation = { redirecting: signal(false), signIn: vi.fn() };
  beforeEach(() => {
    navigation.redirecting.set(false);
    navigation.signIn.mockClear();
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'protected',
            component: ProtectedPage,
            canActivate: [AuthGuard],
          },
          { path: 'signed-out', component: SignedOutPageComponent },
        ]),
        { provide: AuthNavigationService, useValue: navigation },
      ],
    });
    TestBed.overrideComponent(AppComponent, {
      set: { imports: [RouterOutlet, HeaderStub, MatProgressSpinnerModule] },
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('keeps header and content hidden until the current session is verified', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const page: HTMLElement = fixture.nativeElement;
    const router = TestBed.inject(Router);
    const pending = router.navigateByUrl('/protected');
    await vi.waitFor(() =>
      expect(TestBed.inject(ActiveUserService).restorationState()).toBe(
        'loading',
      ),
    );
    fixture.detectChanges();
    expect(page.querySelector('[role="status"]')).not.toBeNull();
    expect(page.textContent).not.toContain('Protected page');
    expect(page.textContent).not.toContain('Authenticated header');
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/me')
      .flush({ id: 7, display_name: 'Cook' });
    expect(await pending).toBe(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(page.textContent).toContain('Protected page');
    expect(page.textContent).toContain('Authenticated header');
  });

  it('blocks protected navigation and shows backend failure without any actions', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const pending = TestBed.inject(Router).navigateByUrl('/protected');
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(TestBed.inject(ActiveUserService).restorationState()).toBe(
        'loading',
      ),
    );
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/me')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    expect(await pending).toBe(false);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
    expect(page.querySelector('button')).toBeNull();
    expect(page.textContent).not.toContain('Protected page');
    expect(navigation.signIn).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated site entry to login without rendering domain content', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const pending = TestBed.inject(Router).navigateByUrl('/protected');
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(TestBed.inject(ActiveUserService).restorationState()).toBe(
        'loading',
      ),
    );
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/me')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(await pending).toBe(false);
    fixture.detectChanges();
    expect(navigation.signIn).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'Protected page',
    );
  });

  it('renders only the signed-out hint and sign-in button after signed-out reload', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await TestBed.inject(Router).navigateByUrl('/signed-out');
    fixture.detectChanges();
    await fixture.whenStable();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.textContent).toContain('Du bist abgemeldet.');
    expect(page.textContent).not.toContain('Authenticated header');
    expect(navigation.signIn).not.toHaveBeenCalled();
    expect(page.querySelectorAll('button')).toHaveLength(1);
    page.querySelector<HTMLButtonElement>('button')?.click();
    expect(navigation.signIn).toHaveBeenCalledTimes(1);
  });

  it('requires login when navigating from signed-out to a protected page', async () => {
    TestBed.createComponent(AppComponent);
    const pending = TestBed.inject(Router).navigateByUrl('/protected');
    await vi.waitFor(() =>
      expect(TestBed.inject(ActiveUserService).restorationState()).toBe(
        'loading',
      ),
    );
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/me')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(await pending).toBe(false);
    expect(navigation.signIn).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(ActiveUserService).activeUser()).toBeNull();
  });

  it('does not redirect for a cancelled guard after navigating to signed-out', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const pending = router.navigateByUrl('/protected');
    await vi.waitFor(() =>
      expect(TestBed.inject(ActiveUserService).restorationState()).toBe(
        'loading',
      ),
    );
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/auth/me',
    );
    expect(await router.navigateByUrl('/signed-out')).toBe(true);
    expect(await pending).toBe(false);
    request.flush(null, { status: 401, statusText: 'Unauthorized' });
    await vi.waitFor(() =>
      expect(TestBed.inject(ActiveUserService).restorationState()).toBe(
        'signed-out',
      ),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(navigation.signIn).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Du bist abgemeldet.',
    );
  });

  it('guards all content route roots, including home, and excludes the signed-out route', () => {
    for (const path of ['', 'foodstuffs', 'recipes']) {
      expect(
        routes.find((route) => route.path === path)?.canActivate,
      ).toContain(AuthGuard);
    }
    expect(
      routes.find((route) => route.path === 'signed-out')?.canActivate,
    ).toBeUndefined();
    expect(
      routes.find((route) => route.path === 'userSelection'),
    ).toBeUndefined();
  });
});
