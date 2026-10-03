import type { MockedObject } from "vitest";
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { backendUrl } from '../constants/api';
import { Router } from '@angular/router';
import { ACTIVE_USER_STORAGE_KEY, ActiveUserService, } from './active-user.service';
import { SnackBarService } from './snack-bar.service';
import { UserBackendService } from './user-backend.service';
import type { UserOut } from '../api/generated';

interface ActiveUserServiceTestContext {
    service: ActiveUserService;
    snackBarService: { open: MockedObject<Pick<SnackBarService, 'open'>>['open'] };
    router: { navigate: MockedObject<Pick<Router, 'navigate'>>['navigate'] };
    userBackendService: { getUserById: MockedObject<Pick<UserBackendService, 'getUserById'>>['getUserById'] };
}

interface DeferredUser {
    promise: Promise<UserOut>;
    resolve: (user: UserOut) => void;
    reject: (reason: unknown) => void;
}

const USER: UserOut = { id: 7, username: 'Roi' };

function createDeferredUser(): DeferredUser {
    let resolve!: (user: UserOut) => void;
    let reject!: (reason: unknown) => void;
    const promise: Promise<UserOut> = new Promise<UserOut>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createContext(getUserById: (userId: number) => Promise<UserOut> = (): Promise<UserOut> => Promise.reject(new HttpErrorResponse({ status: 404 }))): ActiveUserServiceTestContext {
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
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify({ id: USER.id }));
        expect(snackBarService.open).toHaveBeenCalledWith('Als Roi angemeldet');
    });

    it('ignores an invalid runtime selection', () => {
        const { service, snackBarService, router } = createContext();

        service.selectUser(undefined as unknown as UserOut);

        expect(service.activeUser()).toBeNull();
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBeNull();
        expect(snackBarService.open).not.toHaveBeenCalled();
        expect(router.navigate).not.toHaveBeenCalled();
    });

    it('restores and refreshes a persisted user without a selection notification', async () => {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(USER));
        const refreshedUser: UserOut = { id: USER.id, username: 'Renamed Roi' };
        const { service, snackBarService, userBackendService } = createContext((): Promise<UserOut> => Promise.resolve(refreshedUser));

        expect(service.activeUser()).toBeNull();
        expect(service.restorationState()).toBe('loading');
        await settle();

        expect(userBackendService.getUserById).toHaveBeenCalledTimes(1);

        expect(userBackendService.getUserById).toHaveBeenCalledWith(USER.id);
        expect(service.activeUser()).toEqual(refreshedUser);
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify({ id: refreshedUser.id }));
        expect(snackBarService.open).not.toHaveBeenCalled();
    });

    it('clears a persisted selection only when reconciliation confirms deletion', async () => {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(USER));
        const { service, router } = createContext((): Promise<UserOut> => Promise.reject(new HttpErrorResponse({ status: 404 })));

        await settle();

        expect(service.activeUser()).toBeNull();
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBeNull();
        expect(router.navigate).not.toHaveBeenCalled();
        expect(service.restorationState()).toBe('idle');
    });

    it('retains only the stored ID when restoration temporarily fails', async () => {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(USER));
        const { service, router } = createContext((): Promise<UserOut> => Promise.reject(new Error('offline')));

        await settle();

        expect(service.activeUser()).toBeNull();
        expect(service.restorationState()).toBe('error');
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify({ id: USER.id }));
        expect(router.navigate).not.toHaveBeenCalled();
    });

    it('does not let a stale reconciliation override a later selection', async () => {
        const deferredUser: DeferredUser = createDeferredUser();
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(USER));
        const { service, router } = createContext((): Promise<UserOut> => deferredUser.promise);
        const nextUser: UserOut = { id: 8, username: 'Mara' };

        service.selectUser(nextUser);
        deferredUser.resolve(USER);
        await settle();

        expect(service.activeUser()).toEqual(nextUser);
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify({ id: nextUser.id }));
        expect(router.navigate).not.toHaveBeenCalled();
    });

    it('does not let a stale not-found response clear a later selection', async () => {
        const deferredUser: DeferredUser = createDeferredUser();
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(USER));
        const { service, router } = createContext((): Promise<UserOut> => deferredUser.promise);
        const nextUser: UserOut = { id: 8, username: 'Mara' };

        service.selectUser(nextUser);
        deferredUser.reject(new HttpErrorResponse({ status: 404 }));
        await settle();

        expect(service.activeUser()).toEqual(nextUser);
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify({ id: nextUser.id }));
        expect(router.navigate).not.toHaveBeenCalled();
    });

    it('ignores an earlier restoration even when the same user is selected again', async () => {
        const deferredUser = createDeferredUser();
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify({ id: USER.id }));
        const { service } = createContext(() => deferredUser.promise);
        const selectedUser = { ...USER, username: 'Current name' };
        service.selectUser(selectedUser);
        deferredUser.resolve(USER);
        await settle();
        expect(service.activeUser()).toEqual(selectedUser);
        expect(service.restorationState()).toBe('idle');
    });

    it('does not restore a user after switching during a pending request', async () => {
        const deferredUser = createDeferredUser();
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify({ id: USER.id }));
        const { service } = createContext(() => deferredUser.promise);
        service.switchUser();
        deferredUser.resolve(USER);
        await settle();
        expect(service.activeUser()).toBeNull();
        expect(service.restorationState()).toBe('idle');
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBeNull();
    });

    it('discards malformed persistent data safely', () => {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, '{invalid');

        const { service } = createContext();

        expect(service.activeUser()).toBeNull();
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBeNull();
    });

    it.each([null, {}, { id: '7' }, { id: 0 }, { id: -1 }, { id: 7.5 }])('does not fetch a user for invalid stored selection %j', (stored) => {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(stored));
        const { service, userBackendService } = createContext();
        expect(service.activeUser()).toBeNull();
        expect(service.restorationState()).toBe('idle');
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBeNull();
        expect(userBackendService.getUserById).not.toHaveBeenCalled();
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

describe('ActiveUserService HTTP reconciliation', () => {
    let service: ActiveUserService;
    let httpTesting: HttpTestingController;
    const router = { navigate: vi.fn().mockResolvedValue(true) };

    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(USER));
        router.navigate.mockClear();
        vi.spyOn(console, 'warn').mockReturnValue(undefined).mockClear();
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(), provideHttpClientTesting(),
                { provide: SnackBarService, useValue: { open: vi.fn() } },
                { provide: Router, useValue: router },
            ],
        });
        service = TestBed.inject(ActiveUserService);
        httpTesting = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpTesting.verify();
        TestBed.resetTestingModule();
        localStorage.clear();
    });

    it('refreshes storage only with a validated user response', async () => {
        const refreshed = { ...USER, username: 'Renamed Roi' };
        httpTesting.expectOne(`${backendUrl}/users/${USER.id}`).flush(refreshed);
        await settle();
        expect(service.activeUser()).toEqual(refreshed);
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify({ id: refreshed.id }));
    });

    it('keeps the user inactive when a successful response violates the contract', async () => {
        httpTesting.expectOne(`${backendUrl}/users/${USER.id}`).flush({ ...USER, username: 'Unchecked name', unexpected: true });
        await settle();
        expect(service.activeUser()).toBeNull();
        expect(service.restorationState()).toBe('error');
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify({ id: USER.id }));
        expect(router.navigate).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith('failed to restore selected user: ', expect.objectContaining({ name: 'ApiContractError' }));
    });

    it('does not let a stale contract failure affect a newer selection', async () => {
        const nextUser: UserOut = { id: 8, username: 'Mara' };
        service.selectUser(nextUser);
        httpTesting.expectOne(`${backendUrl}/users/${USER.id}`).flush({ id: USER.id });
        await settle();
        expect(service.activeUser()).toEqual(nextUser);
        expect(localStorage.getItem(ACTIVE_USER_STORAGE_KEY)).toBe(JSON.stringify({ id: nextUser.id }));
        expect(router.navigate).not.toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalled();
    });
});
