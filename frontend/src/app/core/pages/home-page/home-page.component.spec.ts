import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { BackendMetaService } from '../../services/backend-meta.service';
import { PageHeaderService } from '../../services/page-header.service';
import { HomePageComponent } from './home-page.component';

describe('HomePageComponent greeting reveal', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string): string | null => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string): void => {
      values.set(key, value);
    }),
  };

  beforeEach(() => {
    values.clear();
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: { defaultView: { sessionStorage: storage } },
        },
        { provide: BackendMetaService, useValue: {} },
        { provide: PageHeaderService, useValue: {} },
      ],
    });
  });

  it('reveals only on the first home visit in a session', () => {
    const firstVisit = TestBed.runInInjectionContext(
      () => new HomePageComponent(),
    );
    const returnVisit = TestBed.runInInjectionContext(
      () => new HomePageComponent(),
    );

    expect(firstVisit.animateGreeting).toBe(true);
    expect(returnVisit.animateGreeting).toBe(false);
    expect(storage.setItem).toHaveBeenCalledOnce();
  });

  it('shows the greeting immediately when a prior visit was stored', () => {
    values.set('kochwiki.home-greeting-revealed', 'true');
    const component = TestBed.runInInjectionContext(
      () => new HomePageComponent(),
    );

    expect(component.animateGreeting).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('still renders when session storage is unavailable', () => {
    storage.getItem.mockImplementationOnce(() => {
      throw new Error('Storage blocked');
    });
    const component = TestBed.runInInjectionContext(
      () => new HomePageComponent(),
    );

    expect(component.animateGreeting).toBe(true);
  });
});
