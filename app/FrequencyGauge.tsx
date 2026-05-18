"use client";

import { useRef, useEffect } from "react";
import { Chart as ChartJS, ArcElement, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip);

const gaugeCenterText = {
  id: "gaugeCenterText",
  afterDraw(chart: ChartJS<"doughnut">) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2 + 10;
    const raw = ((chart.config as any)._frequency as number | undefined) ?? 0;
    const delta = (chart.config as any)._delta as number | null | undefined;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // "Frequency" label
    ctx.fillStyle = "#9ca3af";
    ctx.font = "500 11px system-ui, sans-serif";
    ctx.fillText("Frequency", cx, cy - 24);

    // Value
    ctx.fillStyle = "#111827";
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.fillText((raw ?? 0).toFixed(2), cx, cy);

    // Delta %
    if (delta !== null && delta !== undefined && Number.isFinite(delta)) {
      ctx.fillStyle = delta > 0 ? "#ec1501" : delta < 0 ? "#10b981" : "#9ca3af";
      ctx.font = "500 11px system-ui, sans-serif";
      ctx.fillText(
        `${delta > 0 ? "+" : ""}${(delta ?? 0).toFixed(2)}%`,
        cx,
        cy + 20,
      );
    }
    ctx.restore();
  },
};

interface Props {
  frequency: number;
  delta?: number | null;
}

export default function FrequencyGauge({ frequency, delta }: Props) {
  const chartRef = useRef<ChartJS<"doughnut"> | null>(null);
  const safeFrequency = Number.isFinite(frequency) ? frequency : 0;
  const safeDelta = Number.isFinite(delta as number) ? (delta as number) : null;

  useEffect(() => {
    if (chartRef.current) {
      (chartRef.current.config as any)._frequency = safeFrequency;
      (chartRef.current.config as any)._delta = safeDelta;
      chartRef.current.update();
    }
  }, [safeFrequency, safeDelta]);

  const val = Math.min(safeFrequency, 8);
  const remaining = 8 - val;

  return (
    <Doughnut
      ref={chartRef}
      data={{
        datasets: [
          {
            data: [val, remaining],
            backgroundColor: ["#022138", "#e5e7eb"],
            borderWidth: 0,
            circumference: 180,
            rotation: 270,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          tooltip: { enabled: false },
        },
        layout: {
          padding: { top: 0, bottom: 0, left: 0, right: 0 },
        },
      }}
      plugins={[gaugeCenterText as any]}
    />
  );
}
