import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ImageEditorState } from '../../services/image-editor-state.service';

interface ImageAction {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly run: (input: HTMLInputElement) => void;
}

@Component({
  selector: 'app-image-editor',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './image-editor.component.html',
  styleUrl: './image-editor.component.scss',
})
export class ImageEditorComponent {
  readonly state = input.required<ImageEditorState>();
  readonly placeholder = input.required<string>();
  readonly square = input(false);
  readonly actions = computed<readonly ImageAction[]>(() => {
    const state = this.state();
    const actions: ImageAction[] = [];
    if (state.imageAccessFailed()) {
      actions.push({
        id: 'retry',
        label: 'Bild erneut laden',
        icon: 'refresh',
        run: () => state.loadImagePreview(),
      });
    }
    if (state.invalidImageSelection()) {
      actions.push({
        id: 'discard',
        label: 'Ungültige Auswahl verwerfen',
        icon: 'close',
        run: () => state.discardInvalidSelection(),
      });
    }
    if (state.hasImage()) {
      actions.push({
        id: 'remove',
        label: 'Bild entfernen',
        icon: 'delete',
        run: () => state.removeImage(),
      });
    }
    actions.push({
      id: 'select',
      label: state.hasImage() ? 'Bild ersetzen' : 'Bild auswählen',
      icon: state.hasImage() ? 'edit' : 'add_photo_alternate',
      run: (input: HTMLInputElement) => input.click(),
    });
    return actions;
  });
  readonly feedback = computed(() => {
    const state = this.state();
    if (state.uploadingImage()) return 'Bild wird hochgeladen und geprüft …';
    if (state.imageError()) return state.imageError();
    if (state.loadingImage()) return 'Bild wird geladen …';
    if (state.imageAccessFailed()) return 'Bild konnte nicht geladen werden.';
    return null;
  });
}
