import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  OnDestroy,
  output,
  ViewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Chart, DoughnutController, ArcElement } from 'chart.js';
import { FoodstuffSummary } from '../../../foodstuffs/models/foodstuff-summary';
import { ChartLegendElement } from '../../models/chart-legend-element';

type NutritionValues = Pick<
  FoodstuffSummary,
  'kcal' | 'carbs' | 'protein' | 'fat'
>;

const PLACEHOLDER_VALUE: number = 1;
const PLACEHOLDER_LEGEND: Record<string, ChartLegendElement> = {
  placeholder: {
    displayName: 'Placeholder',
    color: 'rgb(200,200,200)',
    valueAbsolute: PLACEHOLDER_VALUE,
    valuePercentage: 100,
  },
};

@Component({
  selector: 'app-macro-chart',
  imports: [DecimalPipe],
  templateUrl: './macro-chart.component.html',
  styleUrl: './macro-chart.component.scss',
})
export class MacroChartComponent implements OnDestroy {
  nutrition = input.required<NutritionValues>();
  showKcal = input<boolean>(true);

  legendUpdated = output<Record<string, ChartLegendElement>>();

  @ViewChild('canvas')
  readonly canvas: ElementRef<HTMLCanvasElement> | undefined;

  chart: Chart | null = null;

  dataIncompleteOrInvalid = computed(
    (): boolean =>
      this.nutrition().carbs == null ||
      this.nutrition().protein == null ||
      this.nutrition().fat == null ||
      (this.nutrition().carbs == 0 &&
        this.nutrition().protein == 0 &&
        this.nutrition().fat == 0)
  );

  legend = computed(
    (): Record<string, ChartLegendElement> =>
      this.buildLegend(this.nutrition())
  );

  constructor() {
    effect(() => {
      const nutrition = this.nutrition();
      const legend = this.legend();
      const dataIncompleteOrInvalid = this.dataIncompleteOrInvalid();

      this.legendUpdated.emit(legend);
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
        this.dataIncompleteOrInvalid()
      );
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private updateChart(
    nutrition: NutritionValues,
    legend: Record<string, ChartLegendElement>,
    dataIncompleteOrInvalid: boolean
  ): void {
    const chart = this.chart;
    const dataSet = chart?.data.datasets[0];
    if (chart == null || dataSet == null) return;

    dataSet.data = this.getChartData(
      nutrition,
      dataIncompleteOrInvalid
    );
    dataSet.backgroundColor = this.getChartColors(
      legend,
      dataIncompleteOrInvalid
    );
    chart.update();
  }

  private buildLegend = (
    nutrition: NutritionValues
  ): Record<string, ChartLegendElement> =>
    this.dataIncompleteOrInvalid()
      ? PLACEHOLDER_LEGEND
      : {
          carbs: {
            displayName: 'Kohlenhydrate',
            color: 'rgb(19,154,155)',
            valueAbsolute: nutrition.carbs,
            valuePercentage: this.calculateValuePercentage(
              nutrition,
              nutrition.carbs
            ),
          },
          protein: {
            displayName: 'Protein',
            color: 'rgb(155, 255, 117)',
            valueAbsolute: nutrition.protein,
            valuePercentage: this.calculateValuePercentage(
              nutrition,
              nutrition.protein
            ),
          },
          fat: {
            displayName: 'Fett',
            color: 'rgb(255,97,97)',
            valueAbsolute: nutrition.fat,
            valuePercentage: this.calculateValuePercentage(
              nutrition,
              nutrition.fat
            ),
          },
        };

  private createChart(
    canvas: HTMLCanvasElement,
    nutrition: NutritionValues,
    legend: Record<string, ChartLegendElement>,
    dataIncompleteOrInvalid: boolean
  ): void {
    this.chart = new Chart(canvas, {
      type: 'doughnut',
      options: {
        cutout: '70%',
        animation: false,
      },
      data: {
        datasets: [
          {
            data: this.getChartData(
              nutrition,
              dataIncompleteOrInvalid
            ),
            backgroundColor: this.getChartColors(
              legend,
              dataIncompleteOrInvalid
            ),
            borderWidth: 0,
          },
        ],
      },
    });
  }

  private getChartData(
    nutrition: NutritionValues,
    dataIncompleteOrInvalid: boolean
  ): number[] {
    return dataIncompleteOrInvalid
      ? [PLACEHOLDER_VALUE]
      : [
          nutrition.carbs ?? 0,
          nutrition.protein ?? 0,
          nutrition.fat ?? 0,
        ];
  }

  private getChartColors(
    legend: Record<string, ChartLegendElement>,
    dataIncompleteOrInvalid: boolean
  ): string[] {
    return dataIncompleteOrInvalid
      ? [legend['placeholder'].color]
      : [
          legend['carbs'].color,
          legend['protein'].color,
          legend['fat'].color,
        ];
  }

  private calculateValuePercentage(
    nutrition: NutritionValues,
    macroValue: number | null | undefined
  ): number | null {
    if (
      nutrition.carbs == null ||
      nutrition.protein == null ||
      nutrition.fat == null ||
      macroValue == null
    ) {
      return null;
    }

    const macroSum: number =
      nutrition.carbs +
      nutrition.protein +
      nutrition.fat;
    return (macroValue / macroSum) * 100;
  }
}
