import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ActiveUserService } from './active-user.service';
import { AuthNavigationService } from './auth-navigation.service';

describe('Browser authentication navigation', () => {
  const location = { assign: vi.fn() };
  const activeUser = { logout: vi.fn<ActiveUserService['logout']>() };
  const router = { navigate: vi.fn(async () => true) };

  beforeEach(() => {
    location.assign.mockReset();
    activeUser.logout.mockReset();
    router.navigate.mockClear();
    TestBed.configureTestingModule({ providers: [
      { provide: DOCUMENT, useValue: { location } },
      { provide: ActiveUserService, useValue: activeUser },
      { provide: Router, useValue: router },
    ] });
  });

  it('navigates to the fixed same-origin login path only once', () => {
    const service = TestBed.inject(AuthNavigationService);
    expect(service.redirecting()).toBe(false);
    service.signIn();
    service.signIn();
    expect(location.assign).toHaveBeenCalledExactlyOnceWith('/api/auth/login');
    expect(service.redirecting()).toBe(true);
  });

  it('waits for confirmed logout before navigating to the signed-out page', async () => {
    let confirm: (value: boolean) => void = () => { throw new Error('Missing logout resolver'); };
    activeUser.logout.mockImplementation(() => new Promise<boolean>(resolve => { confirm = resolve; }));
    const logout = TestBed.inject(AuthNavigationService).logout();
    expect(activeUser.logout).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
    confirm(true);
    await logout;
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/signed-out']);
  });

  it('does not navigate when logout is not confirmed', async () => {
    activeUser.logout.mockResolvedValue(false);
    await TestBed.inject(AuthNavigationService).logout();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
