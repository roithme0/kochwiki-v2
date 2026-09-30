import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { backendUrl } from '../constants/api';
import type { UserOut } from '../api/generated';
import { UserBackendService } from './user-backend.service';
import { ApiContractError } from '../api/api-contract-error';

const user: UserOut = { id: 7, username: 'Roi' };
const operations: {
    method: string;
    path: string;
    list: boolean;
    run: (service: UserBackendService) => Promise<UserOut | UserOut[]>;
}[] = [
    { method: 'GET', path: '/users', list: true, run: (service) => service.getAllUsers() },
    { method: 'GET', path: '/users/7', list: false, run: (service) => service.getUserById(7) },
    { method: 'POST', path: '/users', list: false, run: (service) => service.postUser({ username: user.username }) },
];

const malformedResponses = [
    { reason: 'missing username', body: { id: 7 } },
    { reason: 'string id', body: { ...user, id: '7' } },
    { reason: 'fractional id', body: { ...user, id: 7.5 } },
    { reason: 'null username', body: { ...user, username: null } },
    { reason: 'undocumented field', body: { ...user, unexpected: true } },
];

describe('UserBackendService', () => {
    let service: UserBackendService;
    let httpTesting: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        service = TestBed.inject(UserBackendService);
        httpTesting = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpTesting.verify();
    });

    it('fetches one user by stable id', async () => {
        const user: UserOut = { id: 7, username: 'Roi' };

        const responsePromise: Promise<UserOut> = service.getUserById(user.id);

        const request = httpTesting.expectOne(`${backendUrl}/users/${user.id}`);
        expect(request.request.method).toBe('GET');
        request.flush(user);

        await expect(responsePromise).resolves.toEqual(user);
    });

    describe.each(operations)('$method $path', (operation) => {
        it('accepts a valid user response', async () => {
            const response = operation.run(service);
            const request = httpTesting.expectOne(backendUrl + operation.path);
            expect(request.request.method).toBe(operation.method);
            if (operation.method === 'POST') {
                expect(request.request.body).toEqual({ username: user.username });
            }
            const body = operation.list ? [user] : user;
            request.flush(body);
            await expect(response).resolves.toEqual(body);
        });

        it.each(malformedResponses)('rejects $reason', async ({ body }) => {
            const response = operation.run(service);
            const request = httpTesting.expectOne(backendUrl + operation.path);
            const endpoint = `${operation.method} ${request.request.url}`;
            const rejection = expect(response).rejects.toMatchObject({
                name: 'ApiContractError',
                endpoint,
                cause: expect.objectContaining({ issues: expect.any(Array) }),
            });
            request.flush(operation.list ? [user, body] : body);
            await rejection;
        });
    });

    it('accepts an empty user list', async () => {
        const response = service.getAllUsers();
        httpTesting.expectOne(backendUrl + '/users').flush([]);
        await expect(response).resolves.toEqual([]);
    });

    it('rejects an object instead of a user list', async () => {
        const response = service.getAllUsers();
        const rejection = expect(response).rejects.toBeInstanceOf(ApiContractError);
        httpTesting.expectOne(backendUrl + '/users').flush(user);
        await rejection;
    });

    it.each([
        { status: 404, statusText: 'Not Found', body: { detail: 'User not found' }, run: (service: UserBackendService) => service.getUserById(7), path: '/users/7' },
        { status: 409, statusText: 'Conflict', body: { detail: 'Duplicate user' }, run: (service: UserBackendService) => service.postUser({ username: 'Roi' }), path: '/users' },
        { status: 422, statusText: 'Unprocessable Entity', body: { detail: [{ loc: ['body', 'username'], msg: 'Invalid name', type: 'value_error' }] }, run: (service: UserBackendService) => service.postUser({ username: '' }), path: '/users' },
    ])('preserves HTTP failure $status and its body', async ({ status, statusText, body, run, path }) => {
        const response = run(service);
        const rejection = expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
        const details = expect(response).rejects.toMatchObject({ status, error: body });
        httpTesting.expectOne(backendUrl + path).flush(body, { status, statusText });
        await rejection;
        await details;
    });
});
