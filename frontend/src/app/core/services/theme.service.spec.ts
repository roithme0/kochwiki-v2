import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let preferenceChanged: ((event: Pick<MediaQueryListEvent, 'matches'>) => void) | undefined;

  beforeEach(() => {
    preferenceChanged = undefined;
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: (_type: string, listener: (event: Pick<MediaQueryListEvent, 'matches'>) => void): void => {
        preferenceChanged = listener;
      },
      removeEventListener: vi.fn(),
    }));
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('follows the system preference until the user chooses a theme', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    preferenceChanged?.({ matches: false });
    expect(service.isDark()).toBe(false);
    service.toggle();
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    preferenceChanged?.({ matches: true });
    preferenceChanged?.({ matches: false });
    expect(service.isDark()).toBe(true);
    service.toggle();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('starts with the system preference again in a fresh application instance', () => {
    TestBed.inject(ThemeService).toggle();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ThemeService).isDark()).toBe(true);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
