import { CanDeactivateFn } from '@angular/router';
import type { RecipeConversationPageComponent } from '../pages/recipe-conversation-page/recipe-conversation-page.component';

export const recipeConversationLeaveGuard: CanDeactivateFn<RecipeConversationPageComponent> = component => component.canLeave();
