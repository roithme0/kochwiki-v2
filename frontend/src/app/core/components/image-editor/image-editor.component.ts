import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { ImageEditorState } from '../../services/image-editor-state.service';

@Component({
  selector: 'app-image-editor',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './image-editor.component.html',
  styleUrl: './image-editor.component.scss',
})
export class ImageEditorComponent {
  readonly state = input.required<ImageEditorState>();
  readonly placeholder = input.required<string>();
  readonly feedback = computed(() => {
    const state = this.state();
    if (state.uploadingImage()) return 'Bild wird hochgeladen und geprüft …';
    if (state.imageError()) return state.imageError();
    if (state.loadingImage()) return 'Bild wird geladen …';
    if (state.imageAccessFailed()) return 'Bild konnte nicht geladen werden.';
    return null;
  });
}
