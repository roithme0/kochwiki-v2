import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoodstuffUnit } from '../../models/foodstuff-unit';
import { FoodstuffFormComponent } from './foodstuff-form.component';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';

describe('FoodstuffFormComponent', () => {
  let component: FoodstuffFormComponent;
  let fixture: ComponentFixture<FoodstuffFormComponent>;
  const imageId = '00000000-0000-4000-8000-000000000010';
  const upload = vi.fn();
  const download = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();
    upload.mockResolvedValue({ id: imageId });
    download.mockResolvedValue({ url: '/storage/saved.png', expiresIn: 300 });
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi
          .fn()
          .mockReturnValue('blob:preview');
        static override revokeObjectURL = revokeObjectURL;
      },
    );
    await TestBed.configureTestingModule({
      imports: [FoodstuffFormComponent],
      providers: [
        { provide: FoodstuffImageService, useValue: { upload, download } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FoodstuffFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('submitLabel', 'Speichern');
  });

  afterEach(() => vi.unstubAllGlobals());

  function select(file: File | null): void {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: { item: () => file } });
    component.image.selectImage(input);
  }

  function validForm(): void {
    fixture.detectChanges();
    component.form.patchValue({ name: 'Basilikum', unit: 'G' });
  }

  it('previews locally and reuses a completed upload across save attempts', async () => {
    validForm();
    const submitted = vi.fn();
    component.submitted.subscribe(submitted);
    const file = new File(['png'], 'basil.png', { type: 'image/png' });
    select(file);
    expect(upload).not.toHaveBeenCalled();
    expect(component.image.imagePreview()).toBe('blob:preview');
    await component.onSubmit();
    await component.onSubmit();
    expect(upload).toHaveBeenCalledExactlyOnceWith(file);
    expect(submitted).toHaveBeenCalledTimes(2);
    expect(submitted).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Basilikum', imageId }),
    );
    fixture.destroy();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:preview');
  });

  it('keeps the selection and fields on upload failure and permits explicit retry', async () => {
    validForm();
    upload.mockRejectedValueOnce(new Error('unavailable'));
    const submitted = vi.fn();
    component.submitted.subscribe(submitted);
    select(new File(['png'], 'basil.png', { type: 'image/png' }));
    await component.onSubmit();
    expect(submitted).not.toHaveBeenCalled();
    expect(component.image.imagePreview()).toBe('blob:preview');
    expect(component.form.controls.name.value).toBe('Basilikum');
    expect(component.busy()).toBe(false);
    expect(component.image.imageError()).toContain('hochgeladen');
    await component.onSubmit();
    expect(submitted).toHaveBeenCalledOnce();
    expect(component.image.imageError()).toBeNull();
  });

  it.each([
    new File([], 'empty.png', { type: 'image/png' }),
    new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', {
      type: 'image/png',
    }),
  ])(
    'blocks invalid files until they are explicitly discarded: $name',
    async (file) => {
      validForm();
      const submitted = vi.fn();
      component.submitted.subscribe(submitted);
      select(file);
      await component.onSubmit();
      expect(upload).not.toHaveBeenCalled();
      expect(submitted).not.toHaveBeenCalled();
      expect(component.image.invalidImageSelection()).toBe(true);
      component.image.discardInvalidSelection();
      await component.onSubmit();
      expect(submitted).toHaveBeenCalledOnce();
    },
  );

  it('preserves a saved image on ordinary edits and sends null only after removal', async () => {
    fixture.componentRef.setInput('foodstuff', {
      name: 'Basilikum',
      unit: 'G',
      imageId,
    });
    fixture.detectChanges();
    const submitted = vi.fn();
    component.submitted.subscribe(submitted);
    await component.onSubmit();
    expect(submitted.mock.calls[0][0]).not.toHaveProperty('imageId');
    component.image.removeImage();
    await component.onSubmit();
    expect(submitted).toHaveBeenLastCalledWith(
      expect.objectContaining({ imageId: null }),
    );
  });

  it.each(['selection', 'removal', 'destruction'])(
    'ignores late download results after %s',
    async (action) => {
      let resolve!: (value: { url: string }) => void;
      download.mockImplementation(
        () =>
          new Promise<{ url: string }>((done) => {
            resolve = done;
          }),
      );
      fixture.componentRef.setInput('foodstuff', { imageId });
      fixture.detectChanges();
      if (action === 'selection')
        select(new File(['png'], 'basil.png', { type: 'image/png' }));
      else if (action === 'removal') component.image.removeImage();
      else fixture.destroy();
      resolve({ url: '/storage/stale.png' });
      await Promise.resolve();
      expect(component.image.imagePreview()).toBe(
        action === 'selection' ? 'blob:preview' : null,
      );
    },
  );

  it('leaves the current selection intact when a replacement file chooser is cancelled', () => {
    validForm();
    select(new File(['png'], 'basil.png', { type: 'image/png' }));
    select(null);
    expect(component.image.imagePreview()).toBe('blob:preview');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('offers explicit fresh access retry without modifying the saved reference', async () => {
    download.mockRejectedValueOnce(new Error('expired'));
    fixture.componentRef.setInput('foodstuff', { imageId });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.image.imageAccessFailed()).toBe(true);
    await component.image.loadImagePreview();
    expect(download).toHaveBeenCalledTimes(2);
    expect(component.image.imagePreview()).toBe('/storage/saved.png');
    expect(component.image.imageAccessFailed()).toBe(false);
  });

  it('blocks repeat submissions and selection changes during upload, then ignores completion after destruction', async () => {
    validForm();
    let resolve!: (value: { id: string }) => void;
    upload.mockImplementation(
      () =>
        new Promise<{ id: string }>((done) => {
          resolve = done;
        }),
    );
    const submitted = vi.fn();
    const busy = vi.fn();
    component.submitted.subscribe(submitted);
    component.uploadingChanged.subscribe(busy);
    select(new File(['png'], 'basil.png', { type: 'image/png' }));
    const pending = component.onSubmit();
    fixture.detectChanges();
    expect(component.form.disabled).toBe(true);
    expect(busy).toHaveBeenCalledWith(true);
    component.image.removeImage();
    select(null);
    await component.onSubmit();
    expect(upload).toHaveBeenCalledOnce();
    expect(component.image.imagePreview()).toBe('blob:preview');
    fixture.destroy();
    resolve({ id: imageId });
    await pending;
    expect(submitted).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('renders local labels and emits the typed foodstuff updates', async () => {
    const submitted = vi.fn().mockName('submitted');
    component.submitted.subscribe(submitted);

    fixture.detectChanges();
    component.form.setValue({
      name: 'Linsen',
      brand: null,
      unit: FoodstuffUnit.Gram,
      kcal: 100,
      carbs: 12,
      protein: 8,
      fat: 1,
    });
    await component.onSubmit();

    const labels: NodeListOf<Element> = (
      fixture.nativeElement as HTMLElement
    ).querySelectorAll('mat-label');
    expect(Array.from(labels, (label) => label.textContent?.trim())).toEqual([
      'Name',
      'Einheit',
      'Marke',
      'Kalorien',
      'Kohlenhydrate',
      'Proteine',
      'Fett',
    ]);
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(submitted).toHaveBeenCalledWith({
      name: 'Linsen',
      brand: null,
      unit: FoodstuffUnit.Gram,
      kcal: 100,
      carbs: 12,
      protein: 8,
      fat: 1,
    });
  });

  it('patches the form when an existing foodstuff is supplied', () => {
    fixture.componentRef.setInput('foodstuff', {
      name: 'Bohnen',
      brand: 'Bio',
      unit: FoodstuffUnit.Gram,
      kcal: 110,
      carbs: 15,
      protein: 7,
      fat: 1,
    });
    fixture.detectChanges();

    expect(component.form.getRawValue()).toEqual({
      name: 'Bohnen',
      brand: 'Bio',
      unit: FoodstuffUnit.Gram,
      kcal: 110,
      carbs: 15,
      protein: 7,
      fat: 1,
    });
  });

  it('offers local labels and submits the matching unit wire values', async () => {
    fixture.detectChanges();
    component.form.controls.name.setValue('Oats');
    const submitted = vi.fn();
    component.submitted.subscribe(submitted);
    const select =
      await TestbedHarnessEnvironment.loader(fixture).getHarness(
        MatSelectHarness,
      );
    await select.open();
    const options = await select.getOptions();
    expect(
      await Promise.all(options.map((option) => option.getText())),
    ).toEqual(['Gramm', 'Milliliter', 'Stück']);
    await select.close();
    for (const [label, unit] of [
      ['Gramm', 'G'],
      ['Milliliter', 'ML'],
      ['Stück', 'PIECE'],
    ]) {
      await select.clickOptions({ text: label });
      await component.onSubmit();
      expect(submitted).toHaveBeenLastCalledWith(
        expect.objectContaining({ unit }),
      );
    }
  });
});
