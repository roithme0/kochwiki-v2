import {
  Component,
  ViewChild,
  computed,
  effect,
  inject,
  ElementRef,
  OnDestroy,
  input,
} from '@angular/core';

import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { FoodstuffOut } from '../../../core/api/generated';
import { FoodstuffVerboseNames } from '../../models/foodstuff-meta-data';
import { FoodstuffTableDisplayedFieldsService } from '../../services/foodstuff-table-displayed-fields.service';
import { FoodstuffMetadataService } from '../../services/foodstuff-metadata.service';
import { FoodstuffPatchDialogComponent } from '../../dialogs/foodstuff-patch-dialog/foodstuff-patch-dialog.component';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { FoodstuffTableControlService } from '../../services/foodstuff-table-control.service';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '../../../core/dialogs/confirmation-dialog/confirmation-dialog.component';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';

const DEFAULT_PAGE_SIZE: number = 12;

@Component({
  selector: 'app-foodstuffs-table',
  imports: [
    MatTableModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MacroChartComponent,
    MatPaginatorModule
],
  templateUrl: './foodstuffs-table.component.html',
  styleUrl: './foodstuffs-table.component.scss',
})
export class FoodstuffsTableComponent implements OnDestroy {
  readonly displayedFieldsService = inject(
    FoodstuffTableDisplayedFieldsService
  );
  readonly foodstuffMetadataService = inject(FoodstuffMetadataService);
  readonly foodstuffBackendService = inject(FoodstuffBackendService);
  readonly snackBarService = inject(SnackBarService);
  readonly dialog = inject(MatDialog);
  readonly foodstuffTableControlService = inject(FoodstuffTableControlService);
  readonly foodstuffs = input<FoodstuffOut[]>([]);

  @ViewChild('tableWrapper', { static: true })
  readonly tableWrapper!: ElementRef<HTMLElement>;
  @ViewChild(MatSort) readonly sort!: MatSort;
  @ViewChild(MatPaginator) readonly paginator!: MatPaginator;

  tableWrapperResizeObserver = new ResizeObserver(() =>
    this.updateTablePageSize()
  );

  displayedFoodstuffs = computed((): FoodstuffOut[] => {
    let displayedFoodstuffs = this.foodstuffs();
    displayedFoodstuffs =
      this.searchFoodstuffsByNameOrBrand(displayedFoodstuffs);
    return displayedFoodstuffs;
  });
  tableDataSource = new MatTableDataSource<FoodstuffOut>(
    this.displayedFoodstuffs()
  );

  displayedVerboseNames = computed((): FoodstuffVerboseNames => {
    const verboseNames: FoodstuffVerboseNames | null =
      this.foodstuffMetadataService.verboseNames();
    return verboseNames == null
      ? {
          name: 'Name',
          brand: 'Marke',
          unit: 'Einheit',
          kcal: 'Kalorien',
          carbs: 'Kohlenhydrate',
          protein: 'Protein',
          fat: 'Fett',
        }
      : verboseNames;
  });

  constructor() {
    effect(() => (this.tableDataSource.data = this.displayedFoodstuffs()));
  }

  ngAfterViewInit(): void {
    this.tableDataSource.sort = this.sort;
    this.tableDataSource.paginator = this.paginator;
    this.tableWrapperResizeObserver.observe(this.tableWrapper.nativeElement);
  }

  ngOnDestroy(): void {
    this.tableWrapperResizeObserver.disconnect();
  }

  contentChanged(): void {
    setTimeout(() => {
      this.updateTablePageSize();
    });
  }

  openEditFoodstuffDialog(foodstuff: FoodstuffOut): void {
    this.dialog.open(FoodstuffPatchDialogComponent, {
      data: { id: foodstuff.id },
      minWidth: 'calc(100vw - 1rem)',
      maxWidth: 'calc(100vw - 1rem)',
      maxHeight: 'calc(100vh - 1rem)',
      position: { top: '0.5rem', left: '0.5rem' },
      autoFocus: false,
      disableClose: true,
    });
  }

  openDeleteFoodstuffDialog(foodstuff: FoodstuffOut): void {
    const data: ConfirmationDialogData = {
      title: 'Lebensmittel löschen?',
      confirmLabel: 'Ja',
      cancelLabel: 'Nein',
      action: () => this.deleteFoodstuff(foodstuff.id),
    };

    this.dialog.open(ConfirmationDialogComponent, {
      data,
      maxWidth: '95vw',
      maxHeight: '95vh',
      autoFocus: false,
    });
  }

  private async deleteFoodstuff(id: number): Promise<void> {
    try {
      await this.foodstuffBackendService.deleteFoodstuff(id);
      this.foodstuffBackendService.notifyFoodstuffsChanged();
      this.snackBarService.open('Zutat gelöscht');
    } catch (error: unknown) {
      console.error('failed to delete foodstuff: ', error);
      this.snackBarService.open('Zutat konnte nicht gelöscht werden');
      throw error;
    }
  }

  private searchFoodstuffsByNameOrBrand(foodstuffs: FoodstuffOut[]): FoodstuffOut[] {
    const searchBy: string = this.foodstuffTableControlService.searchBy();
    return searchBy === ''
      ? foodstuffs
      : foodstuffs.filter(
          (foodstuff) =>
            foodstuff.name.toLowerCase().includes(searchBy.toLowerCase()) ||
            foodstuff.brand?.toLowerCase().includes(searchBy.toLowerCase())
        );
  }

  private updateTablePageSize(): void {
    if (this.tableWrapper == null || this.paginator == null) return;

    const wrapperHeight: number = this.tableWrapper.nativeElement.offsetHeight;
    const rowHeight: number = 36;
    const headerHeight: number = 26;
    const paginatorHeight: number = 40;
    const availableHeight: number =
      wrapperHeight - headerHeight - paginatorHeight;
    const rowsPerPage: number = Math.floor(availableHeight / rowHeight);
    const newPageSize: number =
      rowsPerPage > 0 ? rowsPerPage : DEFAULT_PAGE_SIZE;
    if (this.paginator.pageSize !== newPageSize) {
      this.paginator.pageSize = newPageSize;
      this.tableDataSource.paginator = this.paginator; // updates the table to reflect the new page size
    }
  }
}
