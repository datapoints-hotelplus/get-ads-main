"use client";

import { useEffect, useRef, useState } from "react";
import { Chart as ChartJS, CategoryScale, Tooltip, Legend } from "chart.js";
import {
  ChoroplethController,
  GeoFeature,
  ColorScale,
  ProjectionScale,
} from "chartjs-chart-geo";
import * as topojson from "topojson-client";

ChartJS.register(
  ChoroplethController,
  GeoFeature,
  ColorScale,
  ProjectionScale,
  CategoryScale,
  Tooltip,
  Legend,
);

interface Props {
  regions: { region: string; value: number }[];
}

export default function ThaiGeoChart({ regions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);
  const [topoData, setTopoData] = useState<any>(null);

  // Load Thailand GeoJSON
  useEffect(() => {
    fetch(
      "https://raw.githubusercontent.com/apisit/thailand.json/master/thailand.json",
    )
      .then((r) => r.json())
      .then((data) => {
        // This file is GeoJSON (FeatureCollection), not TopoJSON
        if (data.type === "FeatureCollection") {
          setTopoData({ type: "geo", features: data.features });
        } else if (data.objects) {
          // TopoJSON format
          const objectKey = Object.keys(data.objects)[0];
          const geo = topojson.feature(data, data.objects[objectKey]) as any;
          setTopoData({ type: "geo", features: geo.features });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!topoData || !canvasRef.current) return;

    // Destroy previous chart
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const features = topoData.features;

    // Map region names to values
    const regionMap = new Map<string, number>();
    for (const r of regions) {
      regionMap.set(r.region.toLowerCase(), r.value);
      // Also try without "จ." or "จังหวัด" prefix
      regionMap.set(
        r.region.replace(/^(จ\.|จังหวัด)\s*/i, "").toLowerCase(),
        r.value,
      );
    }

    const data = features.map((f: any) => {
      const name = (
        f.properties.name ||
        f.properties.NAME_1 ||
        ""
      ).toLowerCase();
      return {
        feature: f,
        value: regionMap.get(name) ?? 0,
      };
    });

    chartRef.current = new ChartJS(canvasRef.current, {
      type: "choropleth" as any,
      data: {
        labels: features.map(
          (f: any) => f.properties.name || f.properties.NAME_1 || "",
        ),
        datasets: [
          {
            label: "คลิก",
            data,
            outline: features,
          } as any,
        ],
      },
      options: {
        showOutline: true,
        showGraticule: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const d = ctx.raw;
                return `${d.feature.properties.name || d.feature.properties.NAME_1}: ${(d.value ?? 0).toLocaleString("th-TH")}`;
              },
            },
          },
        },
        scales: {
          projection: {
            axis: "x",
            projection: "mercator",
          } as any,
          color: {
            axis: "x",
            quantize: 5,
            legend: { position: "bottom-right" },
            interpolate: (v: number) => {
              const r = Math.round(59 + (255 - 59) * (1 - v));
              const g = Math.round(130 + (255 - 130) * (1 - v));
              const b = Math.round(246 + (255 - 246) * (1 - v));
              return `rgb(${r},${g},${b})`;
            },
          } as any,
        },
      } as any,
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [topoData, regions]);

  if (!topoData) {
    return (
      <div className="flex items-center justify-center h-[400px] text-gray-400 text-sm">
        กำลังโหลดแผนที่...
      </div>
    );
  }

  return <canvas ref={canvasRef} />;
}
