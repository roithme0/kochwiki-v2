import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component, provideAppInitializer } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { registerAppIcons } from './app-icons';

@Component({
  imports: [MatIconModule],
  template: '<mat-icon svgIcon="home" /><mat-icon svgIcon="hide_image" />',
})
class IconHostComponent {}

describe('App icon registration', () => {
  it('loads both registered icons from local assets and renders their SVGs', async () => {
    TestBed.configureTestingModule({
      imports: [IconHostComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideAppInitializer(registerAppIcons),
      ],
    });

    const fixture = TestBed.createComponent(IconHostComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    for (const name of ['home', 'hide_image'] as const) {
      const request = http.expectOne(`icons/${name}.svg`);
      expect(request.request.method).toBe('GET');
      request.flush(
        `<svg xmlns="http://www.w3.org/2000/svg" data-icon="${name}"><path /></svg>`,
      );
    }
    await fixture.whenStable();

    const host: HTMLElement = fixture.nativeElement as HTMLElement;
    expect(
      host.querySelector('mat-icon[svgIcon="home"] svg[data-icon="home"]'),
    ).not.toBeNull();
    expect(
      host.querySelector(
        'mat-icon[svgIcon="hide_image"] svg[data-icon="hide_image"]',
      ),
    ).not.toBeNull();
    http.verify();
  });
});
