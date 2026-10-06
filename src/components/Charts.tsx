"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const BRAND = "#1d5ef1";
const GRID = "#eef2f7";
const AXIS = "#64748b";

interface Datum {
  label: string;
  value: number;
  href?: string;
}

function ChartTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: Datum }[]; unit: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.label}</p>
      <p className="text-slate-600">
        <span className="font-semibold tabular-nums text-slate-900">{d.value}</span> {unit}
      </p>
    </div>
  );
}

/** Single-series horizontal bar chart (one hue; the card title names the series, so no legend). */
export function HBarChart({ data, unit, height = 260 }: { data: Datum[]; unit: string; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: "#334155" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={<ChartTooltip unit={unit} />} />
          <Bar
            dataKey="value"
            fill={BRAND}
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            onClick={(d) => {
              const href = (d as unknown as { payload?: Datum }).payload?.href;
              if (href) window.location.href = href;
            }}
            className="cursor-pointer"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Score distribution histogram; bars shaded by opportunity level band (LOW / MEDIUM / HIGH). */
export function ScoreHistogram({ data, height = 220 }: { data: Datum[]; height?: number }) {
  const color = (label: string) => {
    const lo = parseInt(label, 10);
    return lo >= 70 ? "#059669" : lo >= 40 ? "#d97706" : "#94a3b8";
  };
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS }} axisLine={false} tickLine={false} interval={0} tickFormatter={(l: string) => l.split("–")[0]} />
          <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={<ChartTooltip unit="companies" />} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={34}>
            {data.map((d) => (
              <Cell key={d.label} fill={color(d.label)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
