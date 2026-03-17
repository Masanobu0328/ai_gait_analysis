"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendDatum = {
  x: number;
  phase: string;
  support_side: string;
  [key: string]: number | string;
};

type SeriesDef = {
  key: string;
  label: string;
  color: string;
  upperLabel: string;
  lowerLabel: string;
  baseline?: number;
  rawKey?: string;
  rawUnit?: string;
  dash?: string;
};

interface MetricTrendCardProps {
  title: string;
  unit: string;
  data: TrendDatum[];
  series: SeriesDef[];
  xLabel: string;
  directionHint?: string;
  showGaitBands?: boolean;
}

const GAIT_BANDS = [
  { x1: 1, x2: 21, color: "#dbeafe" },   // 立脚初期
  { x1: 21, x2: 41, color: "#bfdbfe" },  // 立脚中期
  { x1: 41, x2: 62, color: "#93c5fd" },  // 立脚終期
  { x1: 62, x2: 100, color: "#fee2e2" }, // 遊脚期
];

function adaptiveSmooth(values: number[]): number[] {
  if (values.length < 5) return values.slice();

  const weights = [1, 2, 3, 2, 1];
  const result = values.slice();
  for (let i = 0; i < values.length; i += 1) {
    const current = values[i];
    if (!Number.isFinite(current)) continue;

    let wSum = 0;
    let vSum = 0;
    const local: number[] = [];
    for (let k = -2; k <= 2; k += 1) {
      const idx = i + k;
      if (idx < 0 || idx >= values.length) continue;
      const v = values[idx];
      if (!Number.isFinite(v)) continue;
      const w = weights[k + 2];
      wSum += w;
      vSum += v * w;
      local.push(v);
    }
    if (wSum <= 0 || local.length < 3) continue;

    const weighted = vSum / wSum;
    const localMin = Math.min(...local);
    const localMax = Math.max(...local);
    const localRange = localMax - localMin;
    const delta = Math.abs(current - weighted);
    const preserveThreshold = Math.max(0.15, localRange * 0.4);

    // 急変点は保持し、通常区間のみ軽く平滑化して見た目を整える。
    result[i] = delta > preserveThreshold ? current : current * 0.4 + weighted * 0.6;
  }

  return result;
}

function buildDisplayData(data: TrendDatum[], series: SeriesDef[]): TrendDatum[] {
  if (!data.length || !series.length) return data;

  const out = data.map((d) => ({ ...d }));
  for (const s of series) {
    const rawValues = data.map((d) => {
      const v = Number(d[s.key]);
      return Number.isFinite(v) ? v : Number.NaN;
    });
    const smoothValues = adaptiveSmooth(rawValues);
    for (let i = 0; i < out.length; i += 1) {
      const raw = rawValues[i];
      if (!Number.isFinite(raw)) continue;
      out[i][s.key] = smoothValues[i];
      out[i][`${s.key}__raw`] = raw;
    }
  }
  return out;
}

function phaseName(x: number): string {
  if (x <= 21) return "立脚初期";
  if (x <= 41) return "立脚中期";
  if (x <= 62) return "立脚後期";
  return "遊脚期";
}

function directionLabel(item: SeriesDef, value: number): string {
  if (item.baseline === undefined) return value >= 0 ? item.upperLabel : item.lowerLabel;
  return value >= item.baseline ? item.upperLabel : item.lowerLabel;
}

function summarizeChart(data: TrendDatum[], series: SeriesDef[]): string {
  if (!data.length || !series.length) return "データなし";
  const isGaitCycleAxis = data.every((d) => {
    const x = Number(d.x);
    return Number.isFinite(x) && x >= 0 && x <= 100;
  });

  const analyzeSeries = (s: SeriesDef) => {
    const vals = data.map((d) => Number(d[s.key])).filter((v) => Number.isFinite(v));
    if (!vals.length) {
      return {
        meanDirLabel: "偏り小",
        meanDir: "明確な偏りは目立たない",
        features: [] as string[],
        featureItems: [] as Array<{ phase: string; dir: string }>,
      };
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const meanDirLabel = directionLabel(s, mean);
    const meanDir = `${meanDirLabel}方向に寄る`;

    if (!isGaitCycleAxis) {
      return {
        meanDirLabel,
        meanDir,
        features: [] as string[],
        featureItems: [] as Array<{ phase: string; dir: string }>,
      };
    }

    const allMean = mean;
    const bucket = new Map<string, number[]>();
    for (const d of data) {
      const x = Number(d.x);
      const v = Number(d[s.key]);
      if (!Number.isFinite(x) || !Number.isFinite(v)) continue;
      const p = phaseName(x);
      if (!bucket.has(p)) bucket.set(p, []);
      bucket.get(p)?.push(v);
    }

    const scored: Array<{ score: number; text: string }> = [];
    for (const [phase, arr] of bucket) {
      if (!arr.length) continue;
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      const dev = Math.abs(m - allMean);
      if (dev < 0.12) continue;
      const dir = directionLabel(s, m);
      scored.push({ score: dev, text: `${phase}では${dir}が目立つ` });
    }
    scored.sort((a, b) => b.score - a.score);
    const topItems = scored.slice(0, 2).map((x) => {
      const m = x.text.match(/^(.+)では(.+)が目立つ$/);
      return {
        phase: m?.[1] ?? "",
        dir: m?.[2] ?? "",
      };
    });
    return {
      meanDirLabel,
      meanDir,
      features: scored.slice(0, 2).map((x) => x.text),
      featureItems: topItems.filter((x) => x.phase && x.dir),
    };
  };

  const analyses = series.map((s) => ({ label: s.label, ...analyzeSeries(s) }));

  const right = analyses.find((a) => a.label.includes("右")) ?? analyses[0];
  const left = analyses.find((a) => a.label.includes("左")) ?? analyses[Math.min(1, analyses.length - 1)];
  const rightFeature = right.features.length ? right.features.join("、") : "目立った特徴はない";
  const leftFeature = left.features.length ? left.features.join("、") : "目立った特徴はない";
  const rightMoves = new Set<string>([right.meanDirLabel, ...right.featureItems.map((x) => x.dir)].filter(Boolean));
  const leftMoves = new Set<string>([left.meanDirLabel, ...left.featureItems.map((x) => x.dir)].filter(Boolean));
  const commonMoves = Array.from(rightMoves).filter((m) => leftMoves.has(m) && m !== "偏り小");
  const rightOnlyMoves = Array.from(rightMoves).filter((m) => !leftMoves.has(m) && m !== "偏り小");
  const leftOnlyMoves = Array.from(leftMoves).filter((m) => !rightMoves.has(m) && m !== "偏り小");

  const overallParts: string[] = [];
  if (commonMoves.length) {
    overallParts.push(`左右で共通して${commonMoves.join("・")}方向の動きが見られる`);
  } else {
    overallParts.push("左右で共通する動きは限定的");
  }
  if (rightOnlyMoves.length || leftOnlyMoves.length) {
    const rightTxt = rightOnlyMoves.length ? `右歩行周期では${rightOnlyMoves.join("・")}` : "右歩行周期では目立った偏りは小さい";
    const leftTxt = leftOnlyMoves.length ? `左歩行周期では${leftOnlyMoves.join("・")}` : "左歩行周期では目立った偏りは小さい";
    overallParts.push(`違いとして${rightTxt}、${leftTxt}`);
  }
  const overallText = overallParts.join("。");

  return `全体的な傾向として${overallText}。${right.label}の傾向としては${right.meanDir}、${rightFeature}。${left.label}の傾向としては${left.meanDir}、${leftFeature}。`;
}

export default function MetricTrendCard({
  title,
  unit,
  data,
  series,
  xLabel,
  directionHint,
  showGaitBands = false,
}: MetricTrendCardProps) {
  const displayData = buildDisplayData(data, series);
  const summary = summarizeChart(data, series);
  const values = displayData.flatMap((d) =>
    series.map((s) => {
      const v = Number(d[s.key]);
      return Number.isFinite(v) ? Math.abs(v) : 0;
    }),
  );
  const maxAbs = values.length ? Math.max(...values) : 1;
  const ySpan = Math.max(1, Math.ceil(maxAbs * 1.2));

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm">
      <h4 className="text-sm font-bold text-slate-700 mb-1">{title}</h4>
      {directionHint ? <p className="text-[11px] text-slate-500 mb-2">{directionHint}</p> : null}

      <div className="h-64 relative">
        <div className="absolute right-3 top-2 z-10 pointer-events-none text-right leading-tight">
          <div className="text-[10px] text-slate-700">↑ {series[0]?.upperLabel}</div>
          <div className="text-[10px] text-slate-700">↓ {series[0]?.lowerLabel}</div>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={displayData} margin={{ top: 8, right: 12, left: 12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            {showGaitBands &&
              GAIT_BANDS.map((band) => (
                <ReferenceArea
                  key={`${band.x1}-${band.x2}`}
                  x1={band.x1}
                  x2={band.x2}
                  fill={band.color}
                  fillOpacity={0.28}
                  strokeOpacity={0}
                />
              ))}
            <XAxis
              dataKey="x"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#cbd5e1" }}
              label={{ value: xLabel, position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
              tickMargin={4}
              unit={unit}
              domain={[-ySpan, ySpan]}
            />
            <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as TrendDatum;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow text-xs">
                    <p className="text-slate-600">
                      {xLabel}: {point.x} / {point.phase} / {point.support_side}
                    </p>
                    {series.map((s) => {
                      const v = Number(point[s.key]);
                      const dir =
                        s.baseline === undefined
                          ? v >= 0
                            ? s.upperLabel
                            : s.lowerLabel
                          : v >= s.baseline
                            ? s.upperLabel
                            : s.lowerLabel;
                      const smoothedRaw = Number(point[`${s.key}__raw`]);
                      const raw = Number.isFinite(smoothedRaw)
                        ? smoothedRaw
                        : s.rawKey
                          ? Number(point[s.rawKey])
                          : null;
                      return (
                        <p key={s.key} style={{ color: s.color }}>
                          {s.label}: {v.toFixed(2)}
                          {unit}（{dir}）
                          {raw !== null && Number.isFinite(raw) ? ` / 元値 ${raw.toFixed(1)}${s.rawUnit || unit}` : ""}
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                type="monotone"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dash}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-600">AIサマリー: {summary}</p>
    </div>
  );
}

