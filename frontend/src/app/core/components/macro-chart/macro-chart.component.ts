import type { AfterViewInit } from '@angular/core';
import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  inject,
  LOCALE_ID,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Chart, DoughnutController, ArcElement } from 'chart.js';
import {
  NutritionSummary,
  formatNutritionResult,
} from '../../models/nutrition-result';
import {
  buildNutritionLegend,
  hasMacroDistribution,
} from '../../utils/nutrition-legend';
import { ChartLegendElement } from '../../models/chart-legend-element';

const PLACEHOLDER_VALUE: number = 1;
const PLACEHOLDER_COLOR = 'rgb(157, 145, 129)';

@Component({
  selector: 'app-macro-chart',
  templateUrl: './macro-chart.component.html',
  styleUrl: './macro-chart.component.scss',
})
export class MacroChartComponent implements OnDestroy, AfterViewInit {
  nutrition = input.required<NutritionSummary>();
  showKcal = input<boolean>(true);

  private readonly locale = inject(LOCALE_ID);

  readonly displayedKcal = computed(
    () =>
      `${formatNutritionResult(this.nutrition().kcal, 0, this.locale)} kcal`,
  );

  @ViewChild('canvas')
  readonly canvas: ElementRef<HTMLCanvasElement> | undefined;

  chart: Chart | null = null;

  dataIncompleteOrInvalid = computed(
    () => !hasMacroDistribution(this.nutrition()),
  );

  legend = computed((): Record<string, ChartLegendElement> =>
    buildNutritionLegend(this.nutrition()),
  );

  constructor() {
    effect(() => {
      const nutrition = this.nutrition();
      const legend = this.legend();
      const dataIncompleteOrInvalid = this.dataIncompleteOrInvalid();

      this.updateChart(nutrition, legend, dataIncompleteOrInvalid);
    });
  }

  ngAfterViewInit(): void {
    Chart.register(DoughnutController, ArcElement);
    const canvasElement = this.canvas?.nativeElement;
    if (canvasElement != undefined) {
      this.createChart(
        canvasElement,
        this.nutrition(),
        this.legend(),
        this.dataIncompleteOrInvalid(),
      );
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private updateChart(
    nutrition: NutritionSummary,
    legend: Record<string, ChartLegendElement>,
    dataIncompleteOrInvalid: boolean,
  ): void {
    const chart = this.chart;
    const dataSet = chart?.data.datasets[0];
    if (chart == null || dataSet == null) return;

    dataSet.data = this.getChartData(nutrition, dataIncompleteOrInvalid);
    dataSet.backgroundColor = this.getChartColors(
      legend,
      dataIncompleteOrInvalid,
    );
    chart.update();
  }

  private createChart(
    canvas: HTMLCanvasElement,
    nutrition: NutritionSummary,
    legend: Record<string, ChartLegendElement>,
    dataIncompleteOrInvalid: boolean,
  ): void {
    this.chart = new Chart(canvas, {
      type: 'doughnut',
      options: {
        cutout: '70%',
      },
      data: {
        datasets: [
          {
            data: this.getChartData(nutrition, dataIncompleteOrInvalid),
            backgroundColor: this.getChartColors(
              legend,
              dataIncompleteOrInvalid,
            ),
            borderWidth: 0,
          },
        ],
      },
    });
  }

  private getChartData(
    nutrition: NutritionSummary,
    dataIncompleteOrInvalid: boolean,
  ): number[] {
    return dataIncompleteOrInvalid
      ? [PLACEHOLDER_VALUE]
      : [
          nutrition.carbs.value ?? 0,
          nutrition.protein.value ?? 0,
          nutrition.fat.value ?? 0,
        ];
  }

  private getChartColors(
    legend: Record<string, ChartLegendElement>,
    dataIncompleteOrInvalid: boolean,
  ): string[] {
    return dataIncompleteOrInvalid
      ? [PLACEHOLDER_COLOR]
      : [legend['carbs'].color, legend['protein'].color, legend['fat'].color];
  }
}
