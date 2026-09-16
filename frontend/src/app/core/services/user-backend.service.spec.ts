import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { backendUrl } from '../constants/api';
import { User } from '../models/user';
import { UserBackendService } from './user-backend.service';

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
        const user: User = { id: 7, username: 'Roi' };

        const responsePromise: Promise<User> = service.getUserById(user.id);

        const request = httpTesting.expectOne(`${backendUrl}/users/${user.id}`);
        expect(request.request.method).toBe('GET');
        request.flush(user);

        await expect(responsePromise).resolves.toEqual(user);
    });
});
