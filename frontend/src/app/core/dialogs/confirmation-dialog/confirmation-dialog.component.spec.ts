import type { MockedObject } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ConfirmationDialogComponent, ConfirmationDialogData, } from './confirmation-dialog.component';

interface DeferredAction {
    promise: Promise<void>;
    resolve: () => void;
    reject: (reason: unknown) => void;
}

function createDeferredAction(): DeferredAction {
    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    const promise: Promise<void> = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

describe('ConfirmationDialogComponent', () => {
    let fixture: ComponentFixture<ConfirmationDialogComponent>;
    let component: ConfirmationDialogComponent;
    let dialogRef: MockedObject<Pick<MatDialogRef<ConfirmationDialogComponent>, 'close' | 'disableClose'>>;
    let data: ConfirmationDialogData;

    beforeEach(async () => {
        dialogRef = {
            close: vi.fn().mockName('MatDialogRef.close'),
            disableClose: false,
        };
        data = {
            title: 'Eintrag löschen?',
            confirmLabel: 'Ja',
            cancelLabel: 'Nein',
            action: (): Promise<void> => Promise.resolve(),
        };

        await TestBed.configureTestingModule({
            imports: [ConfirmationDialogComponent],
            providers: [
                { provide: MAT_DIALOG_DATA, useFactory: (): ConfirmationDialogData => data },
                { provide: MatDialogRef, useFactory: () => dialogRef },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(ConfirmationDialogComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('closes after the action succeeds', async () => {
        const action = vi.fn().mockName('action').mockResolvedValue(undefined);
        data.action = action;

        await component.confirm();

        expect(action).toHaveBeenCalledTimes(1);
        expect(dialogRef.close).toHaveBeenCalledTimes(1);
    });

    it('closes without executing the action when canceled', () => {
        const action = vi.fn().mockName('action');
        data.action = action;

        component.cancel();

        expect(action).not.toHaveBeenCalled();
        expect(dialogRef.close).toHaveBeenCalledTimes(1);
    });

    it('re-enables confirmation after the action fails', async () => {
        data.action = (): Promise<void> => Promise.reject(new Error('failed'));

        await component.confirm();
        fixture.detectChanges();

        expect(component.isExecuting()).toBe(false);
        expect(dialogRef.disableClose).toBe(false);
        expect(dialogRef.close).not.toHaveBeenCalled();
        expect(fixture.nativeElement.querySelector('mat-spinner')).toBeNull();
    });

    it('prevents duplicate submissions and closing while the action runs', async () => {
        const deferredAction: DeferredAction = createDeferredAction();
        const action = vi.fn().mockName('action').mockReturnValue(deferredAction.promise);
        data.action = action;

        const firstConfirmation: Promise<void> = component.confirm();
        const secondConfirmation: Promise<void> = component.confirm();
        fixture.detectChanges();

        const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('button');
        expect(action).toHaveBeenCalledTimes(1);
        expect(component.isExecuting()).toBe(true);
        expect(dialogRef.disableClose).toBe(true);
        expect(buttons[0].disabled).toBe(true);
        expect(buttons[1].disabled).toBe(true);

        component.cancel();
        expect(dialogRef.close).not.toHaveBeenCalled();

        deferredAction.resolve();
        await Promise.all([firstConfirmation, secondConfirmation]);

        expect(dialogRef.close).toHaveBeenCalledTimes(1);
    });
});
