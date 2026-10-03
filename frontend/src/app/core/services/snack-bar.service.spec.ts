import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { SnackBarService } from './snack-bar.service';

describe('Snackbar feedback', () => {
  const action = new Subject<void>();
  const dismiss = vi.fn();
  const open = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    open.mockReset().mockReturnValue({ dismiss, onAction: () => action });
    dismiss.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: MatSnackBar, useValue: { open } }] });
  });
  afterEach(() => vi.useRealTimers());
  it('preserves text-only timing and offers a longer optional action', () => {
    const service = TestBed.inject(SnackBarService);
    service.open('Text');
    vi.runAllTimers();
    expect(open).toHaveBeenCalledWith('Text', '', { duration: 2000 });
    const run = vi.fn();
    const handle = service.open('Saved', { label: 'Open', run });
    vi.runAllTimers();
    expect(open).toHaveBeenLastCalledWith('Saved', 'Open', { duration: 10000 });
    action.next();
    expect(run).toHaveBeenCalledTimes(1);
    handle.dismiss();
    action.next();
    expect(run).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
  it('invalidates feedback before the scheduled snackbar opens', () => {
    const handle = TestBed.inject(SnackBarService).open('Stale');
    handle.dismiss();
    vi.runAllTimers();
    expect(open).not.toHaveBeenCalled();
  });
});
