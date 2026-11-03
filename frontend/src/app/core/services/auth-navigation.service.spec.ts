import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActiveUserService } from './active-user.service';
import { AuthNavigationService } from './auth-navigation.service';

describe('Browser authentication navigation', () => {
  const location = { assign: vi.fn() };
  const activeUser = { logout: vi.fn<ActiveUserService['logout']>() };

  beforeEach(() => {
    location.assign.mockReset();
    activeUser.logout.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: { location } },
        { provide: ActiveUserService, useValue: activeUser },
      ],
    });
  });

  it('navigates to the fixed same-origin login path only once', () => {
    const service = TestBed.inject(AuthNavigationService);
    expect(service.redirecting()).toBe(false);
    service.signIn();
    service.signIn();
    expect(location.assign).toHaveBeenCalledExactlyOnceWith('/api/auth/login');
    expect(service.redirecting()).toBe(true);
  });

  it('waits for confirmed logout before navigating to the provider logout', async () => {
    let confirm: (value: string | null) => void = () => {
      throw new Error('Missing logout resolver');
    };
    activeUser.logout.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          confirm = resolve;
        }),
    );
    const logout = TestBed.inject(AuthNavigationService).logout();
    expect(activeUser.logout).toHaveBeenCalledTimes(1);
    expect(location.assign).not.toHaveBeenCalled();
    confirm('https://idp.example/logout');
    await logout;
    expect(location.assign).toHaveBeenCalledExactlyOnceWith(
      'https://idp.example/logout',
    );
  });

  it('does not navigate when logout is not confirmed', async () => {
    activeUser.logout.mockResolvedValue(null);
    await TestBed.inject(AuthNavigationService).logout();
    expect(location.assign).not.toHaveBeenCalled();
  });
});
