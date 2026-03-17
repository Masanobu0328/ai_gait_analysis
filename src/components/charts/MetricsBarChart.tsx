"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    LabelList,
} from "recharts";
import type { MetricValue } from "@/lib/api";

interface MetricsBarChartProps {
    metrics: Record<string, MetricValue>;
}

const METRIC_LABELS: Record<string, string> = {
    pelvic_obliquity: "骨盤傾斜",
    shoulder_tilt: "肩傾斜",
    knee_alignment_r: "右膝アライメント",
    knee_alignment_l: "左膝アライメント",
    knee_asymmetry: "膝左右差",
    trunk_sway: "体幹揺れ",
    head_tilt: "頭部傾斜",
    head_inclination: "頭部前傾",
};

// Modern color palette with gradients
const STATUS_COLORS: Record<string, { main: string; light: string }> = {
    "良好": { main: "#10b981", light: "#d1fae5" },
    "注意": { main: "#f59e0b", light: "#fef3c7" },
    "要改善": { main: "#ef4444", light: "#fee2e2" },
};

export default function MetricsBarChart({ metrics }: MetricsBarChartProps) {
    const data = Object.entries(metrics)
        .filter(([key]) => METRIC_LABELS[key]) // Only show labeled metrics
        .map(([key, metric]) => ({
            name: METRIC_LABELS[key] || key,
            value: Math.abs(metric.value),
            displayValue: `${metric.value.toFixed(1)}${metric.unit}`,
            unit: metric.unit,
            status: metric.status,
            reference: metric.reference,
        }));

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex gap-4 text-xs">
                    {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                        <span key={status} className="flex items-center gap-1.5">
                            <span
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: colors.main }}
                            />
                            {status}
                        </span>
                    ))}
                </div>
            </div>

            <div className="h-72 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        layout="vertical"
                        margin={{ top: 0, right: 80, left: 10, bottom: 0 }}
                        barCategoryGap="20%"
                    >
                        <defs>
                            {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                                <linearGradient
                                    key={status}
                                    id={`gradient-${status}`}
                                    x1="0"
                                    y1="0"
                                    x2="1"
                                    y2="0"
                                >
                                    <stop offset="0%" stopColor={colors.main} stopOpacity={0.9} />
                                    <stop offset="100%" stopColor={colors.main} stopOpacity={0.6} />
                                </linearGradient>
                            ))}
                        </defs>

                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                            horizontal={false}
                        />
                        <XAxis
                            type="number"
                            tick={{ fill: "#64748b", fontSize: 11 }}
                            axisLine={{ stroke: "#e2e8f0" }}
                            tickLine={false}
                        />
                        <YAxis
                            dataKey="name"
                            type="category"
                            tick={{ fill: "#334155", fontSize: 12, fontWeight: 500 }}
                            width={100}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: "#f1f5f9" }}
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const data = payload[0].payload;
                                return (
                                    <div className="bg-white px-4 py-3 rounded-lg shadow-lg border border-slate-200">
                                        <p className="font-semibold text-slate-800">{data.name}</p>
                                        <p className="text-lg font-bold text-slate-900">{data.displayValue}</p>
                                        <p className="text-xs text-slate-500 mt-1">{data.reference || "基準値参照"}</p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span
                                                className="w-2 h-2 rounded-full"
                                                style={{ backgroundColor: STATUS_COLORS[data.status]?.main || "#64748b" }}
                                            />
                                            <span className="text-sm">{data.status}</span>
                                        </div>
                                    </div>
                                );
                            }}
                        />
                        <Bar
                            dataKey="value"
                            radius={[0, 6, 6, 0]}
                            maxBarSize={28}
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={`url(#gradient-${entry.status})`}
                                />
                            ))}
                            <LabelList
                                dataKey="displayValue"
                                position="right"
                                fill="#334155"
                                fontSize={12}
                                fontWeight={600}
                            />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
