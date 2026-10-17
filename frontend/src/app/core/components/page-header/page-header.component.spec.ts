import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { PageHeaderComponent } from './page-header.component';
import { ActiveUserService } from '../../services/active-user.service';
import { PageHeaderService } from '../../services/page-header.service';
import { BackendMetaService } from '../../services/backend-meta.service';
import type { UserOut } from '../../api/generated';

const USER: UserOut = { id: 7, display_name: 'Roi' };

describe('PageHeaderComponent', () => {
  let fixture: ComponentFixture<PageHeaderComponent>;
  let activeUserService: Pick<
    ActiveUserService,
    'activeUser' | 'logout' | 'logoutPending'
  >;

  beforeEach(async () => {
    activeUserService = {
      activeUser: signal<UserOut | null>(USER),
      logout: vi.fn(async () => true),
      logoutPending: signal(false),
    };

    await TestBed.configureTestingModule({
      imports: [PageHeaderComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        {
          provide: ActiveUserService,
          useValue: activeUserService,
        },
        {
          provide: PageHeaderService,
          useValue: {
            showHome: signal(false),
            headline: signal('Home'),
            subheader: signal(''),
            showBack: signal(false),
            back: signal(''),
            showUserOptions: signal(true),
          },
        },
        { provide: BackendMetaService, useValue: {} },
      ],
    }).compileComponents();

    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(PageHeaderComponent);
    fixture.detectChanges();
  });

  it('offers the active user and logout action from an accessible options menu', async () => {
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button[aria-label="Benutzeroptionen öffnen"]',
    );
    expect(trigger).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[fontIcon="logout"]'),
    ).toBeNull();

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const menu = await loader.getHarness(MatMenuHarness);
    await menu.open();

    const items = await menu.getItems();
    expect(items.length).toBe(2);
    expect(await items[1].getText()).toContain('Abmelden');
    expect(await items[1].getText()).toContain('logout');
    expect(document.body.textContent).toContain('Roi');

    await items[1].click();
    expect(activeUserService.logout).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([
        '/signed-out',
      ]),
    );
  });

  it('stays on the current page when logout is not confirmed', async () => {
    vi.mocked(activeUserService.logout).mockResolvedValue(false);
    await fixture.componentInstance.logout();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });

  it('keeps the light theme action visible and disabled', async () => {
    const menu =
      await TestbedHarnessEnvironment.loader(fixture).getHarness(
        MatMenuHarness,
      );
    await menu.open();
    const [toggle] = await menu.getItems();
    expect(await toggle.getText()).toContain('Helles Design');
    expect(await toggle.getText()).toContain('light_mode');
    expect(await toggle.isDisabled()).toBe(true);
    await toggle.click();
    expect(await menu.isOpen()).toBe(true);
    expect(activeUserService.logout).not.toHaveBeenCalled();
  });
});
