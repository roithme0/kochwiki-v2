import type { MockedObject } from "vitest";
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ACTIVE_USER_STORAGE_KEY, ActiveUserService, } from './active-user.service';
import { SnackBarService } from './snack-bar.service';
import { UserBackendService } from './user-backend.service';
import { User } from '../models/user';

interface ActiveUserServiceTestContext {
    service: ActiveUserService;
    snackBarService: { open: MockedObject<Pick<SnackBarService, 'open'>>['open'] };
    router: { navigate: MockedObject<Pick<Router, 'navigate'>>['navigate'] };
    userBackendService: { getUserById: MockedObject<Pick<UserBackendService, 'getUserById'>>['getUserById'] };
}

interface DeferredUser {
    promise: Promise<User>;
    resolve: (user: User) => void;
    reject: (reason: unknown) => void;
}

const USER: User = { id: 7, username: 'Roi' };

function createDeferredUser(): DeferredUser {
    let resolve!: (user: User) => void;
    let reject!: (reason: unknown) => void;
    const promise: Promise<User> = new Promise<User>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createContext(getUserById: (userId: number) => Promise<User> = (): Promise<User> => Promise.reject(new HttpErrorResponse({ status: 404 }))): ActiveUserServiceTestContext {
    const snackBarService: ActiveUserServiceTestContext['snackBarService'] = {
        open: vi.fn().mockName("SnackBarService.open")
    };
    const router: ActiveUserServiceTestContext['router'] = {
        navigate: vi.fn().mockName("Router.navigate")
    };
    const userBackendService: ActiveUserServiceTestContext['userBackendService'] = {
        getUserById: vi.fn().mockName("UserBackendService.getUserById")
    };
    router.navigate.mockResolvedValue(true);
    userBackendService.getUserById.mockImplementation(getUserById);

    TestBed.configureTestingModule({
        providers: [
            { provide: SnackBarService, useValue: snackBarService },
            { provide: Router, useValue: router },
            { provide: UserBackendService, useValue: userBackendService },
        ],
    });

    return {
        service: TestBed.inject(ActiveUserService),
        snackBarService,
        router,
        userBackendService,
    };
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('ActiveUserService', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        TestBed.resetTestingModule();
        localStorage.clear();
    });

    it('persists an explicitly selected user and reports the selection', () => {
        const { service, snackBarService } = createContext();

        service.selectUser(USER);

        expect(service.activeUser()).toEqual(USER);
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify(USER));
        expect(snackBarService.open).toHaveBeenCalledWith('Als Roi angemeldet');
    });

    it('ignores an invalid runtime selection', () => {
        const { service, snackBarService, router } = createContext();

        service.selectUser(undefined as unknown as User);

        expect(service.activeUser()).toBeNull();
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBeNull();
        expect(snackBarService.open).not.toHaveBeenCalled();
        expect(router.navigate).not.toHaveBeenCalled();
    });

    it('restores and refreshes a persisted user without a selection notification', async () => {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(USER));
        const refreshedUser: User = { id: USER.id, username: 'Renamed Roi' };
        const { service, snackBarService, userBackendService } = createContext((): Promise<User> => Promise.resolve(refreshedUser));

        expect(service.activeUser()).toEqual(USER);
        await settle();

        expect(userBackendService.getUserById).toHaveBeenCalledTimes(1);

        expect(userBackendService.getUserById).toHaveBeenCalledWith(USER.id);
        expect(service.activeUser()).toEqual(refreshedUser);
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify(refreshedUser));
        expect(snackBarService.open).not.toHaveBeenCalled();
    });

    it('clears a persisted selection only when reconciliation confirms deletion', async () => {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(USER));
        const { service, router } = createContext((): Promise<User> => Promise.reject(new HttpErrorResponse({ status: 404 })));

        await settle();

        expect(service.activeUser()).toBeNull();
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBeNull();
        expect(router.navigate).toHaveBeenCalledWith(['/userSelection']);
    });

    it('retains a persisted selection when reconciliation temporarily fails', async () => {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(USER));
        const { service, router } = createContext((): Promise<User> => Promise.reject(new Error('offline')));

        await settle();

        expect(service.activeUser()).toEqual(USER);
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify(USER));
        expect(router.navigate).not.toHaveBeenCalled();
    });

    it('does not let a stale reconciliation override a later selection', async () => {
        const deferredUser: DeferredUser = createDeferredUser();
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(USER));
        const { service, router } = createContext((): Promise<User> => deferredUser.promise);
        const nextUser: User = { id: 8, username: 'Mara' };

        service.selectUser(nextUser);
        deferredUser.resolve(USER);
        await settle();

        expect(service.activeUser()).toEqual(nextUser);
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify(nextUser));
        expect(router.navigate).not.toHaveBeenCalled();
    });

    it('does not let a stale not-found response clear a later selection', async () => {
        const deferredUser: DeferredUser = createDeferredUser();
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(USER));
        const { service, router } = createContext((): Promise<User> => deferredUser.promise);
        const nextUser: User = { id: 8, username: 'Mara' };

        service.selectUser(nextUser);
        deferredUser.reject(new HttpErrorResponse({ status: 404 }));
        await settle();

        expect(service.activeUser()).toEqual(nextUser);
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify(nextUser));
        expect(router.navigate).not.toHaveBeenCalled();
    });

    it('discards malformed persistent data safely', () => {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, '{invalid');

        const { service } = createContext();

        expect(service.activeUser()).toBeNull();
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBeNull();
    });

    it('clears persistent selection data when switching users', () => {
        const { service, router } = createContext();
        service.selectUser(USER);

        service.switchUser();

        expect(service.activeUser()).toBeNull();
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBeNull();
        expect(router.navigate).toHaveBeenCalledWith(['/userSelection']);
    });
});
