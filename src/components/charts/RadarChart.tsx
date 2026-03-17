"use client";

import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
} from "recharts";
import type { RadarScore } from "@/lib/api";

interface RadarChartProps {
    scores: RadarScore;
}

const LABELS: Record<keyof RadarScore, string> = {
    pelvic_tilt: "骨盤",
    shoulder_tilt: "肩",
    knee_alignment: "膝",
    head_tilt: "頭部",
    trunk_stability: "体幹",
};

export default function PentagonRadarChart({ scores }: RadarChartProps) {
    const data = Object.entries(scores).map(([key, value]) => ({
        subject: LABELS[key as keyof RadarScore],
        score: value,
        fullMark: 100,
    }));

    return (
        <div className="w-full h-72 md:h-80 relative">
            {/* Background glow effect */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-500/20 blur-3xl" />
            </div>

            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                    {/* Gradient definition */}
                    <defs>
                        <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.8} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.4} />
                        </linearGradient>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    <PolarGrid
                        stroke="#cbd5e1"
                        strokeWidth={1}
                        gridType="polygon"
                        radialLines={false}
                    />
                    <PolarAngleAxis
                        dataKey="subject"
                        tick={{
                            fill: "#334155",
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                        tickLine={false}
                    />
                    <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                        tickCount={5}
                        axisLine={false}
                    />
                    <Radar
                        name="スコア"
                        dataKey="score"
                        stroke="#0891b2"
                        strokeWidth={2.5}
                        fill="url(#radarGradient)"
                        filter="url(#glow)"
                        dot={{
                            r: 4,
                            fill: "#0891b2",
                            stroke: "#fff",
                            strokeWidth: 2,
                        }}
                    />
                </RadarChart>
            </ResponsiveContainer>

            {/* Score legend */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-6 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-500" />
                    良好: 80+
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    注意: 50-79
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    要改善: 50未満
                </span>
            </div>
        </div>
    );
}
