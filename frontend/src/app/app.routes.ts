import { Routes } from '@angular/router';
import { HomePageComponent } from './core/pages/home-page/home-page.component';
import { AuthGuard } from './core/classes/auth-guard';

export const routes: Routes = [
  {
    path: '',
    component: HomePageComponent,
    title: 'Home',
    canActivate: [AuthGuard],
  },
  {
    path: 'foodstuffs',
    loadComponent: () =>
      import('./foodstuffs/pages/foodstuffs-page/foodstuffs-page.component').then(
        ({ FoodstuffsPageComponent }) => FoodstuffsPageComponent,
      ),
    title: 'Lebensmittel',
    canActivate: [AuthGuard],
  },
  {
    path: 'recipes',
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./recipes/pages/recipes-page/recipes-page.component').then(
            ({ RecipesPageComponent }) => RecipesPageComponent,
          ),
        title: 'Rezepte',
      },
      {
        path: ':lineageId/versions/:recipeVersionId',
        loadComponent: () =>
          import('./recipes/pages/recipe-page/recipe-page.component').then(
            ({ RecipePageComponent }) => RecipePageComponent,
          ),
        title: 'Rezeptversion',
      },
      {
        path: ':lineageId',
        loadComponent: () =>
          import('./recipes/pages/recipe-page/recipe-page.component').then(
            ({ RecipePageComponent }) => RecipePageComponent,
          ),
        title: 'Rezept',
      },
    ],
  },
  {
    path: 'chat-ui-demo',
    loadComponent: () =>
      import('./chat-ui/pages/chat-ui-demo-page/chat-ui-demo-page.component').then(
        ({ ChatUiDemoPageComponent }) => ChatUiDemoPageComponent,
      ),
    title: 'Chat-UI Demo',
    canActivate: [AuthGuard],
  },
  {
    path: 'userSelection',
    loadComponent: () =>
      import('./core/pages/select-user-page/select-user-page.component').then(
        ({ SelectUserPageComponent }) => SelectUserPageComponent,
      ),
    title: 'Benutzer auswählen',
  },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];
