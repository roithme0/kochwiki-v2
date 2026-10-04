import { Component, DestroyRef, ElementRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ElementWidthService } from './element-width.service';

@Component({ template: '{{ width() }}' })
class WidthHostComponent {
  readonly width = inject(ElementWidthService).observe(
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
    inject(DestroyRef),
  );
}

describe('ElementWidthService', () => {
  let observers: WidthObserverMock[];

  class WidthObserverMock implements ResizeObserver {
    target?: Element;
    readonly disconnect = vi.fn();
    readonly unobserve = vi.fn();

    constructor(private readonly callback: ResizeObserverCallback) {
      observers.push(this);
    }

    observe(target: Element): void {
      this.target = target;
    }

    resize(width: number): void {
      if (!this.target) throw new Error('No observed element');
      this.callback([{
        target: this.target,
        contentRect: new DOMRectReadOnly(0, 0, width, 100),
        contentBoxSize: [],
        borderBoxSize: [],
        devicePixelContentBoxSize: [],
      }], this);
    }
  }

  beforeEach(() => {
    observers = [];
    vi.stubGlobal('ResizeObserver', WidthObserverMock);
    TestBed.configureTestingModule({ imports: [WidthHostComponent] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('tracks independent element widths and disconnects only the destroyed owner', async () => {
    const first = TestBed.createComponent(WidthHostComponent);
    const second = TestBed.createComponent(WidthHostComponent);
    first.detectChanges();
    second.detectChanges();
    await first.whenStable();
    await second.whenStable();

    expect(observers).toHaveLength(2);
    expect(observers[0].target).toBe(first.nativeElement);
    expect(observers[1].target).toBe(second.nativeElement);
    observers[0].resize(480);
    observers[1].resize(1000);
    expect(first.componentInstance.width()).toBe(480);
    expect(second.componentInstance.width()).toBe(1000);

    observers[0].resize(320);
    expect(first.componentInstance.width()).toBe(320);
    expect(second.componentInstance.width()).toBe(1000);
    first.destroy();
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(observers[1].disconnect).not.toHaveBeenCalled();
    observers[1].resize(700);
    expect(second.componentInstance.width()).toBe(700);
    second.destroy();
    expect(observers[1].disconnect).toHaveBeenCalledTimes(1);
  });

  it('cancels observation when destroyed before the first render', () => {
    let destroy: () => void = () => {};
    const destroyRef: DestroyRef = {
      destroyed: false,
      onDestroy(callback: () => void): () => void {
        destroy = callback;
        return () => {};
      },
    };
    TestBed.inject(ElementWidthService).observe(document.createElement('div'), destroyRef);
    destroy();
    TestBed.tick();
    expect(observers).toHaveLength(0);
  });
});
