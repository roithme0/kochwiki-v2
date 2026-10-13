import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-text-reveal',
  templateUrl: './text-reveal.component.html',
  styleUrl: './text-reveal.component.scss',
})
export class TextRevealComponent {
  readonly text = input.required<string>();
  readonly characterDelay = input(40);
  readonly startDelay = input(0);
  private readonly segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

  readonly characters = computed(() => {
    const text = this.text();
    const delay = Math.max(0, this.characterDelay());
    const startDelay = Math.max(0, this.startDelay());
    return Array.from(this.segmenter.segment(text), ({ segment }, index) => ({
      value: segment,
      delay: startDelay + index * delay,
      key: `${text}:${index}`,
    }));
  });
}
