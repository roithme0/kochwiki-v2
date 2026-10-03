import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import type { UserOut } from '../../api/generated';
import { SnackBarService } from '../../services/snack-bar.service';
import { UserBackendService } from '../../services/user-backend.service';
import { UserCreateDialogComponent } from './user-create-dialog.component';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { backendUrl } from '../../constants/api';

describe('UserCreateDialogComponent', () => {
    it('keeps the dialog open without announcing creation when the response violates the contract', async () => {
        const dialogRef = { close: vi.fn() };
        const snackBarService = { open: vi.fn() };
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        TestBed.configureTestingModule({
            imports: [UserCreateDialogComponent],
            providers: [
                provideHttpClient(), provideHttpClientTesting(),
                { provide: MatDialogRef, useValue: dialogRef },
                { provide: SnackBarService, useValue: snackBarService },
            ],
        });
        const component = TestBed.createComponent(UserCreateDialogComponent).componentInstance;
        const notify = vi.spyOn(component.userBackendService, 'notifyUsersChanged');
        const httpTesting = TestBed.inject(HttpTestingController);
        component.userForm.setValue({ username: 'Daniel' });

        const submission = component.onSubmit();
        httpTesting.expectOne(backendUrl + '/users').flush({ id: 7, username: 'Daniel', unexpected: true });
        await submission;

        expect(dialogRef.close).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
        expect(snackBarService.open).toHaveBeenCalledWith('Benutzer konnte nicht erstellt werden');
        httpTesting.verify();
    });

    it('closes with the created user after a successful submission', async () => {
        const createdUser: UserOut = { id: 7, username: 'Daniel' };
        const dialogRef = {
            close: vi.fn().mockName("MatDialogRef.close")
        };
        const userBackendService = {
            postUser: vi.fn().mockName("UserBackendService.postUser"),
            notifyUsersChanged: vi.fn().mockName("UserBackendService.notifyUsersChanged")
        };
        const snackBarService = {
            open: vi.fn().mockName("SnackBarService.open")
        };
        userBackendService.postUser.mockResolvedValue(createdUser);

        TestBed.configureTestingModule({
            imports: [UserCreateDialogComponent],
            providers: [
                { provide: MatDialogRef, useValue: dialogRef },
                { provide: UserBackendService, useValue: userBackendService },
                { provide: SnackBarService, useValue: snackBarService },
            ],
        });
        const component: UserCreateDialogComponent = TestBed.createComponent(UserCreateDialogComponent).componentInstance;
        component.userForm.setValue({ username: createdUser.username });

        await component.onSubmit();

        expect(userBackendService.postUser).toHaveBeenCalledWith({
            username: createdUser.username,
        });
        expect(dialogRef.close).toHaveBeenCalledTimes(1);
        expect(dialogRef.close).toHaveBeenCalledWith(createdUser);
    });
});
