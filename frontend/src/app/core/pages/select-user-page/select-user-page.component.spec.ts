import { NEVER, Subject } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { User } from '../../models/user';
import { ActiveUserService } from '../../services/active-user.service';
import { PageHeaderService } from '../../services/page-header.service';
import { SnackBarService } from '../../services/snack-bar.service';
import { UserBackendService } from '../../services/user-backend.service';
import { UserCreateDialogComponent } from '../../dialogs/user-create-dialog/user-create-dialog.component';
import { SelectUserPageComponent } from './select-user-page.component';

describe('SelectUserPageComponent', () => {
    it('shows an error without the create button and loads users after retry', async () => {
        const user: User = { id: 7, username: 'Daniel' };
        const getAllUsers = vi.fn().mockName('getAllUsers').mockReturnValueOnce(Promise.reject(new Error('request failed'))).mockReturnValueOnce(Promise.resolve([user]));
        vi.spyOn(console, 'error').mockReturnValue(undefined);

        TestBed.configureTestingModule({
            imports: [SelectUserPageComponent],
            providers: [
                { provide: MatDialog, useValue: {
                        open: vi.fn().mockName("MatDialog.open")
                    } },
                { provide: ActiveUserService, useValue: {} },
                { provide: Router, useValue: {} },
                { provide: PageHeaderService, useValue: { updateHeader: () => { } } },
                { provide: UserBackendService, useValue: { usersChanged$: NEVER, getAllUsers } },
                { provide: SnackBarService, useValue: {} },
            ],
        });
        const fixture = TestBed.createComponent(SelectUserPageComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const page: HTMLElement = fixture.nativeElement;
        expect(page.querySelector('[role="alert"]')?.textContent).toContain('Benutzer konnten nicht geladen werden.');
        expect(page.querySelector('.create-user-button')).toBeNull();

        const retryButton = page.querySelector<HTMLButtonElement>('.error button');
        retryButton?.click();
        fixture.detectChanges();
        expect(page.querySelector('mat-spinner')).not.toBeNull();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(getAllUsers).toHaveBeenCalledTimes(2);
        expect(page.querySelector('mat-card-title')?.textContent).toContain('Daniel');
        expect(page.querySelector('.create-user-button')).not.toBeNull();
        expect(page.querySelector('[role="alert"]')).toBeNull();
    });

    it('focuses the username input and selects a newly created user', () => {
        const createdUser: User = { id: 7, username: 'Daniel' };
        const afterClosed = new Subject<User | undefined>();
        const dialogRef = {
            afterClosed: () => afterClosed.asObservable(),
        } as MatDialogRef<UserCreateDialogComponent, User>;
        const dialog = {
            open: vi.fn().mockName("MatDialog.open")
        };
        const activeUserService = {
            selectUser: vi.fn().mockName("ActiveUserService.selectUser")
        };
        const router = {
            navigate: vi.fn().mockName("Router.navigate")
        };
        dialog.open.mockReturnValue(dialogRef);
        router.navigate.mockResolvedValue(true);

        TestBed.configureTestingModule({
            imports: [SelectUserPageComponent],
            providers: [
                { provide: MatDialog, useValue: dialog },
                { provide: ActiveUserService, useValue: activeUserService },
                { provide: Router, useValue: router },
                { provide: PageHeaderService, useValue: {} },
                {
                    provide: UserBackendService,
                    useValue: { usersChanged$: NEVER },
                },
                { provide: SnackBarService, useValue: {} },
            ],
        });
        const component: SelectUserPageComponent = TestBed.createComponent(SelectUserPageComponent).componentInstance;

        component.openUserCreateDialog();

        const dialogConfig = vi.mocked(dialog.open).mock.lastCall![1];
        expect(dialogConfig?.autoFocus).toBe('input[formControlName="username"]');

        afterClosed.next(createdUser);

        expect(activeUserService.selectUser).toHaveBeenCalledTimes(1);

        expect(activeUserService.selectUser).toHaveBeenCalledWith(createdUser);
        expect(router.navigate).toHaveBeenCalledTimes(1);
        expect(router.navigate).toHaveBeenCalledWith(['']);
    });

    it('does not select a user when creation is aborted', () => {
        const afterClosed = new Subject<User | undefined>();
        const dialogRef = {
            afterClosed: () => afterClosed.asObservable(),
        } as MatDialogRef<UserCreateDialogComponent, User | undefined>;
        const dialog = {
            open: vi.fn().mockName("MatDialog.open")
        };
        const activeUserService = {
            selectUser: vi.fn().mockName("ActiveUserService.selectUser")
        };
        const router = {
            navigate: vi.fn().mockName("Router.navigate")
        };
        dialog.open.mockReturnValue(dialogRef);

        TestBed.configureTestingModule({
            imports: [SelectUserPageComponent],
            providers: [
                { provide: MatDialog, useValue: dialog },
                { provide: ActiveUserService, useValue: activeUserService },
                { provide: Router, useValue: router },
                { provide: PageHeaderService, useValue: {} },
                {
                    provide: UserBackendService,
                    useValue: { usersChanged$: NEVER },
                },
                { provide: SnackBarService, useValue: {} },
            ],
        });
        const component: SelectUserPageComponent = TestBed.createComponent(SelectUserPageComponent).componentInstance;

        component.openUserCreateDialog();
        afterClosed.next(undefined);

        expect(activeUserService.selectUser).not.toHaveBeenCalled();
        expect(router.navigate).not.toHaveBeenCalled();
    });
});
