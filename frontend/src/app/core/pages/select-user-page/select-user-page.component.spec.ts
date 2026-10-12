import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { UserOut } from '../../api/generated';
import { ActiveUserService } from '../../services/active-user.service';
import { PageHeaderService } from '../../services/page-header.service';
import { UserBackendService } from '../../services/user-backend.service';
import { SelectUserPageComponent } from './select-user-page.component';

describe('SelectUserPageComponent', () => {
    it('shows an error and loads provider users after retry without a creation action', async () => {
        const user: UserOut = { id: 7, display_name: 'Daniel' };
        const getAllUsers = vi.fn().mockReturnValueOnce(Promise.reject(new Error('request failed'))).mockResolvedValueOnce([user]);
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        TestBed.configureTestingModule({
            imports: [SelectUserPageComponent],
            providers: [
                { provide: ActiveUserService, useValue: {} },
                { provide: Router, useValue: {} },
                { provide: PageHeaderService, useValue: { updateHeader: () => {} } },
                { provide: UserBackendService, useValue: { getAllUsers } },
            ],
        });
        const fixture = TestBed.createComponent(SelectUserPageComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        const page: HTMLElement = fixture.nativeElement;
        expect(page.querySelector('[role="alert"]')?.textContent).toContain('Benutzer konnten nicht geladen werden.');
        page.querySelector<HTMLButtonElement>('.error button')?.click();
        fixture.detectChanges();
        expect(page.querySelector('mat-spinner')).not.toBeNull();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(getAllUsers).toHaveBeenCalledTimes(2);
        expect(page.querySelector('mat-card-title')?.textContent).toContain('Daniel');
        expect(page.querySelector('button')).toBeNull();
        expect(page.querySelector('[role="alert"]')).toBeNull();
    });

    it('selects an existing user by ID when display names are shared', async () => {
        const users: UserOut[] = [{ id: 7, display_name: 'Daniel' }, { id: 8, display_name: 'Daniel' }];
        const activeUserService = { selectUser: vi.fn() };
        const router = { navigate: vi.fn().mockResolvedValue(true) };
        TestBed.configureTestingModule({
            imports: [SelectUserPageComponent],
            providers: [
                { provide: ActiveUserService, useValue: activeUserService },
                { provide: Router, useValue: router },
                { provide: PageHeaderService, useValue: { updateHeader: () => {} } },
                { provide: UserBackendService, useValue: { getAllUsers: vi.fn().mockResolvedValue(users) } },
            ],
        });
        const fixture = TestBed.createComponent(SelectUserPageComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        const page: HTMLElement = fixture.nativeElement;
        const cards = page.querySelectorAll<HTMLElement>('mat-card');
        expect(cards).toHaveLength(2);
        cards[1].click();
        expect(activeUserService.selectUser).toHaveBeenCalledWith(users[1]);
        expect(router.navigate).toHaveBeenCalledWith(['']);
        expect(page.querySelector('button')).toBeNull();
    });
});
