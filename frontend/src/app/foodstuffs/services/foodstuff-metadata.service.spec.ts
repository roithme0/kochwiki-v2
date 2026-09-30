import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FoodstuffMetadataService } from './foodstuff-metadata.service';
import { SnackBarService } from '../../core/services/snack-bar.service';
import { backendUrl } from '../../core/constants/api';
import type { FoodstuffVerboseNames, FoodstuffUnitChoices } from '../../core/api/generated';

const verboseNames: FoodstuffVerboseNames = {
    name: 'Name', brand: 'Marke', unit: 'Einheit', unitVerbose: 'Einheit',
    kcal: 'Kalorien', carbs: 'Kohlenhydrate', protein: 'Proteine', fat: 'Fett',
};
const unitChoices: FoodstuffUnitChoices = { G: 'g', ML: 'ml', PIECE: 'Stk.' };

describe('FoodstuffMetadataService', () => {
    const open = vi.fn();
    let service: FoodstuffMetadataService;
    let httpTesting: HttpTestingController;

    beforeEach(() => {
        open.mockClear();
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting(),
                { provide: SnackBarService, useValue: { open } }],
        });
        service = TestBed.inject(FoodstuffMetadataService);
        httpTesting = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpTesting.verify();
        vi.restoreAllMocks();
    });

    it('publishes both validated metadata responses', async () => {
        httpTesting.expectOne(backendUrl + '/foodstuffs-meta-data/verbose-names').flush(verboseNames);
        httpTesting.expectOne(backendUrl + '/foodstuffs-meta-data/unit-choices').flush(unitChoices);
        await vi.waitFor(() => expect(service.unitChoices()).toEqual(unitChoices));
        expect(service.verboseNames()).toEqual(verboseNames);
        expect(open).not.toHaveBeenCalled();
    });

    it('keeps both signals empty and reports failure when one response is malformed', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        httpTesting.expectOne(backendUrl + '/foodstuffs-meta-data/verbose-names').flush(verboseNames);
        httpTesting.expectOne(backendUrl + '/foodstuffs-meta-data/unit-choices').flush({ G: 'g' });
        await vi.waitFor(() => expect(open).toHaveBeenCalledWith(
            'Metadaten für Lebensmittel konnten nicht geladen werden'
        ));
        expect(service.verboseNames()).toBeNull();
        expect(service.unitChoices()).toBeNull();
    });
});
