import { ApplicationConfig, provideAppInitializer } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { registerAppIcons } from './core/app-icons';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withFetch()),
    provideAppInitializer(registerAppIcons),
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: {
        subscriptSizing: 'dynamic',
      },
    },
  ],
};
