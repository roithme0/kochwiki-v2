import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { PageHeaderComponent } from './page-header.component';
import { ActiveUserService } from '../../services/active-user.service';
import { PageHeaderService } from '../../services/page-header.service';
import { BackendMetaService } from '../../services/backend-meta.service';
import { User } from '../../models/user';

const USER: User = { id: 7, username: 'Roi' };

describe('PageHeaderComponent', () => {
    let fixture: ComponentFixture<PageHeaderComponent>;
    let activeUserService: Pick<ActiveUserService, 'activeUser' | 'switchUser'>;

    beforeEach(async () => {
        activeUserService = {
            activeUser: signal<User | null>(USER),
            switchUser: vi.fn().mockName('switchUser'),
        };

        await TestBed.configureTestingModule({
            imports: [PageHeaderComponent, NoopAnimationsModule],
            providers: [
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

        fixture = TestBed.createComponent(PageHeaderComponent);
        fixture.detectChanges();
    });

    it('offers the active user and switching action from an accessible options menu', async () => {
        const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('button[aria-label="Benutzeroptionen öffnen"]');
        expect(trigger).not.toBeNull();
        expect(fixture.nativeElement.querySelector('[fontIcon="logout"]')).toBeNull();

        const loader = TestbedHarnessEnvironment.loader(fixture);
        const menu = await loader.getHarness(MatMenuHarness);
        await menu.open();

        const items = await menu.getItems();
        expect(items.length).toBe(2);
        expect(await items[1].getText()).toContain('Benutzer wechseln');
        expect(await items[1].getText()).toContain('switch_account');
        expect(document.body.textContent).toContain('Roi');

        await items[1].click();
        expect(activeUserService.switchUser).toHaveBeenCalledTimes(1);
    });

    it('toggles the theme through the menu and updates the icon and next action', async () => {
        const menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatMenuHarness);
        const initiallyDark = fixture.componentInstance.themeService.isDark();
        await menu.open();
        const [toggle] = await menu.getItems();
        expect(await toggle.getText()).toContain(initiallyDark ? 'Helles Design' : 'Dunkles Design');
        expect(await toggle.getText()).toContain(initiallyDark ? 'light_mode' : 'dark_mode');
        await toggle.click();
        expect(await menu.isOpen()).toBe(false);
        expect(document.documentElement.getAttribute('data-theme')).toBe(initiallyDark ? 'light' : 'dark');
        await menu.open();
        const [nextToggle] = await menu.getItems();
        expect(await nextToggle.getText()).toContain(initiallyDark ? 'Dunkles Design' : 'Helles Design');
        expect(await nextToggle.getText()).toContain(initiallyDark ? 'dark_mode' : 'light_mode');
    });
});
