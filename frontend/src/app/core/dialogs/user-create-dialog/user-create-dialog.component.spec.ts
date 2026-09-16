import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { User } from '../../models/user';
import { SnackBarService } from '../../services/snack-bar.service';
import { UserBackendService } from '../../services/user-backend.service';
import { UserCreateDialogComponent } from './user-create-dialog.component';

describe('UserCreateDialogComponent', () => {
    it('closes with the created user after a successful submission', async () => {
        const createdUser: User = { id: 7, username: 'Daniel' };
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
