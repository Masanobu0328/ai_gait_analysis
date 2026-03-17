"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
} from "recharts";

interface LeftRightCompareProps {
    leftValue: number;
    rightValue: number;
    label: string;
    unit: string;
}

export default function LeftRightCompareChart({
    leftValue,
    rightValue,
    label,
    unit,
}: LeftRightCompareProps) {
    // Calculate asymmetry for visual feedback
    const diff = Math.abs(leftValue - rightValue);
    const asymmetryLevel = diff > 5 ? "high" : diff > 2 ? "medium" : "low";

    const data = [
        { side: "右", value: rightValue },
        { side: "左", value: leftValue },
    ];

    const colors = {
        right: "#0891b2", // cyan-600
        left: "#6366f1",  // indigo-500
    };

    return (
        <div className="w-full bg-slate-50 rounded-xl p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-700">
                    {label}
                </h4>
                <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${asymmetryLevel === "high"
                        ? "bg-rose-100 text-rose-700"
                        : asymmetryLevel === "medium"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                    }`}>
                    差: {diff.toFixed(1)}{unit}
                </div>
            </div>

            {/* Chart */}
            <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{ top: 10, right: 20, left: 20, bottom: 0 }}
                        barCategoryGap="30%"
                    >
                        <defs>
                            <linearGradient id="rightGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={colors.right} stopOpacity={1} />
                                <stop offset="100%" stopColor={colors.right} stopOpacity={0.6} />
                            </linearGradient>
                            <linearGradient id="leftGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={colors.left} stopOpacity={1} />
                                <stop offset="100%" stopColor={colors.left} stopOpacity={0.6} />
                            </linearGradient>
                        </defs>

                        <XAxis
                            dataKey="side"
                            tick={{ fill: "#334155", fontSize: 13, fontWeight: 600 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis hide />
                        <Tooltip
                            cursor={false}
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const data = payload[0].payload;
                                return (
                                    <div className="bg-slate-800 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                                        <span className="font-semibold">{data.side}: </span>
                                        <span>{data.value.toFixed(1)}{unit}</span>
                                    </div>
                                );
                            }}
                        />
                        <ReferenceLine y={0} stroke="#cbd5e1" />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={60}>
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={index === 0 ? "url(#rightGradient)" : "url(#leftGradient)"}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Value display */}
            <div className="flex justify-center gap-8 mt-2">
                <div className="text-center">
                    <div className="text-lg font-bold text-cyan-600">{rightValue.toFixed(1)}{unit}</div>
                    <div className="text-xs text-slate-500">右側</div>
                </div>
                <div className="w-px bg-slate-200" />
                <div className="text-center">
                    <div className="text-lg font-bold text-indigo-500">{leftValue.toFixed(1)}{unit}</div>
                    <div className="text-xs text-slate-500">左側</div>
                </div>
            </div>
        </div>
    );
}
