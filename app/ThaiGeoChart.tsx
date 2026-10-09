"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
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
  // Lets the caller trigger resetZoom() from its own UI (a button outside
  // this component) without re-architecting this into a controlled
  // component — the zoom state below is imperative by nature, so this just
  // exposes the same shape chartjs-plugin-zoom's API would have.
  apiRef?: RefObject<{ resetZoom: () => void } | null>;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 20;

export default function ThaiGeoChart({ regions, apiRef }: Props) {
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

    // zoom/pan state — plain mutable object (not React state): read and
    // written synchronously inside native event handlers below, and must
    // survive across chart.update() calls without triggering a React
    // re-render on every wheel tick / mousemove.
    const zoom = { scale: 1, offset: [0, 0] as [number, number] };

    const chart = new ChartJS(canvasRef.current, {
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
        responsive: true,
        // maintainAspectRatio: false so the parent container's own size
        // (the card, stretched to match the province table beside it)
        // decides this chart's size instead of a fixed width:height ratio.
        maintainAspectRatio: false,
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
            // Re-derived every updateBounds() call as
            // refScale * fitToContainer * projectionScale /
            // [fit-center + projectionOffset] — the chart's own supported
            // zoom/pan knobs (see offset.html in chartjs-chart-geo's docs).
            // chartjs-plugin-zoom doesn't apply here: it operates on
            // regular x/y scales, and this projection scale (geographic,
            // from d3-geo) isn't one — confirmed against chartjs-chart-geo's
            // own GitHub discussion #136. Mutating the live d3 projection's
            // scale()/translate() directly doesn't stick either: the
            // controller's update() calls updateBounds() on every update
            // and unconditionally recomputes both from these two options,
            // overwriting any direct mutation. These are the only values
            // that actually survive a re-render.
            projectionScale: zoom.scale,
            projectionOffset: zoom.offset,
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
    chartRef.current = chart;

    const projectionOptions = () => (chart.options.scales as any).projection;
    const liveProjection = () => (chart.scales as any).projection?.projection;

    const applyZoom = () => {
      const o = projectionOptions();
      o.projectionScale = zoom.scale;
      o.projectionOffset = zoom.offset;
      chart.update("none");
    };

    // ── Wheel = zoom (centered on the cursor), drag = pan ──────────────────
    const canvas = canvasRef.current;

    // Keep the map's centre inside the canvas however far it's zoomed/dragged,
    // and snap back to centred at 1x, so it can never be lost off-screen.
    const clampOffset = (o: [number, number]): [number, number] => {
      if (zoom.scale <= ZOOM_MIN) return [0, 0];
      const lx = (canvas.clientWidth * zoom.scale) / 2;
      const ly = (canvas.clientHeight * zoom.scale) / 2;
      return [Math.max(-lx, Math.min(lx, o[0])), Math.max(-ly, Math.min(ly, o[1]))];
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // don't also scroll the page underneath
      const p = liveProjection();
      if (!p) return;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nextScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom.scale * factor));
      if (nextScale === zoom.scale) return;
      const k = nextScale / zoom.scale;
      // Keep the geographic point under the cursor fixed on screen. The
      // projection's live translate() already includes our current offset, so
      // the standard zoom-around-a-point formula t' = m - k * (m - t) applies
      // to it directly; the new offset is t' minus the auto-fit base.
      // (Previously the k * (...) term used the base without the offset, so
      // every wheel tick after the first compounded the error and flung the
      // map out of the canvas.)
      const rect = canvas.getBoundingClientRect();
      const mouse: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
      const [liveX, liveY] = p.translate();
      const baseX = liveX - zoom.offset[0];
      const baseY = liveY - zoom.offset[1];
      zoom.scale = nextScale;
      zoom.offset = clampOffset([
        mouse[0] - k * (mouse[0] - liveX) - baseX,
        mouse[1] - k * (mouse[1] - liveY) - baseY,
      ]);
      applyZoom();
    };

    let dragging = false;
    let last: [number, number] = [0, 0];
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      last = [e.clientX, e.clientY];
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - last[0];
      const dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      zoom.offset = clampOffset([zoom.offset[0] + dx, zoom.offset[1] + dy]);
      applyZoom();
    };
    const endDrag = (e: PointerEvent) => {
      dragging = false;
      canvas.style.cursor = zoom.scale > ZOOM_MIN ? "grab" : "";
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // already released (e.g. pointercancel) — nothing to clean up
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.style.touchAction = "none"; // this canvas owns pinch/drag, not page scroll

    if (apiRef) {
      apiRef.current = {
        resetZoom: () => {
          zoom.scale = 1;
          zoom.offset = [0, 0];
          canvas.style.cursor = "";
          applyZoom();
        },
      };
    }

    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [topoData, regions, apiRef]);

  if (!topoData) {
    return (
      <div className="flex items-center justify-center h-[400px] text-gray-400 text-sm">
        กำลังโหลดแผนที่...
      </div>
    );
  }

  // relative: Chart.js's responsive resize (ResizeObserver on the canvas's
  // immediate parent) is reliable for an absolutely/flex-sized canvas only
  // when that parent is itself positioned — without it, caller layouts that
  // size this via flex can leave the canvas stuck at a stale size until an
  // unrelated reflow nudges it. overflow-hidden since panning can otherwise
  // push the canvas's own painted content past its box at high zoom.
  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} />
    </div>
  );
}
