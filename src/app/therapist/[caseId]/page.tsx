"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import MetricsBarChart from "@/components/charts/MetricsBarChart";
import LeftRightCompareChart from "@/components/charts/LeftRightCompare";
import SkeletonPlayer from "@/components/charts/SkeletonPlayer";
import MetricTrendCard from "@/components/charts/MetricTrendCard";
import {
  getTherapistReview,
  getResults,
  type TherapistReview,
  type AnalysisResults,
  type MetricCyclePoint,
  type MetricTrendPoint,
} from "@/lib/api";

function resolveBackendOrigin(): string {
  if (typeof window !== "undefined") {
    // ブラウザでは現在ホストを優先。localhost固定を避ける。
    let port = "8100";
    const envApiBase = process.env.NEXT_PUBLIC_API_URL;
    if (envApiBase) {
      try {
        const u = new URL(envApiBase);
        if (u.port) port = u.port;
      } catch {
        // no-op
      }
    }
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }
  const envApiBase = process.env.NEXT_PUBLIC_API_URL;
  if (envApiBase) {
    try {
      return new URL(envApiBase).origin;
    } catch {
      // fall through
    }
  }
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  return new URL(apiBase).origin;
}

type ChartPoint = {
  x: number;
  phase: string;
  support_side: string;
  knee_right: number;
  knee_left: number;
  knee_right_delta: number;
  knee_left_delta: number;
  pelvic_tilt: number;
  shoulder_tilt: number;
  trunk_sway: number;
  com_lateral: number;
};

function buildChartDataFromCycle(points: MetricCyclePoint[]): ChartPoint[] {
  return points.map((point) => ({
    x: point.gait_percent,
    phase: point.phase,
    support_side: point.support_side,
    knee_right: point.knee_right,
    knee_left: point.knee_left,
    knee_right_delta: point.knee_right - 180,
    knee_left_delta: point.knee_left - 180,
    pelvic_tilt: point.pelvic_tilt,
    shoulder_tilt: point.shoulder_tilt,
    trunk_sway: point.trunk_sway,
    com_lateral: point.com_lateral ?? 0,
  }));
}

function buildChartDataFromTrend(points: MetricTrendPoint[]): ChartPoint[] {
  return points.map((point) => ({
    x: point.frame,
    phase: point.phase,
    support_side: point.support_side,
    knee_right: point.knee_right,
    knee_left: point.knee_left,
    knee_right_delta: point.knee_right - 180,
    knee_left_delta: point.knee_left - 180,
    pelvic_tilt: point.pelvic_tilt,
    shoulder_tilt: point.shoulder_tilt,
    trunk_sway: point.trunk_sway,
    com_lateral: point.com_lateral ?? 0,
  }));
}

function shiftCycleStart(points: MetricCyclePoint[], shiftPercent: number): MetricCyclePoint[] {
  const n = points.length;
  if (n === 0) return [];
  const shift = ((Math.round((shiftPercent / 100) * n) % n) + n) % n;
  return Array.from({ length: n }, (_, idx) => {
    const src = points[(idx + shift) % n];
    return {
      ...src,
      gait_percent: idx + 1,
    };
  });
}

export default function TherapistResultPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params.caseId as string;

  const [review, setReview] = useState<TherapistReview | null>(null);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reviewData, resultsData] = await Promise.all([
          getTherapistReview(caseId),
          getResults(caseId),
        ]);
        setReview(reviewData);
        setResults(resultsData);
      } catch (err) {
        setError("データの読み込みに失敗しました");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [caseId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-cyan-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600">データを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-md">
          <p className="text-red-800 mb-4">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2 bg-red-600 text-white rounded-lg"
          >
            トップに戻る
          </button>
        </div>
      </div>
    );
  }

  const skeletonVideoSrc = results?.skeleton_video_url ? `${resolveBackendOrigin()}${results.skeleton_video_url}` : null;
  const trendPoints = results?.trend_points ?? [];
  const cycleProfile = results?.cycle_profile ?? [];
  const hasCycleProfile = cycleProfile.length > 0;
  const cycleQuality = results?.cycle_quality;
  const trunkUnit = results?.trunk_sway_unit || "%";
  const comUnit = results?.com_lateral_unit || "cm";

  const chartDataRightStart = hasCycleProfile
    ? buildChartDataFromCycle(cycleProfile)
    : buildChartDataFromTrend(trendPoints);
  const cycleProfileLeftStart = hasCycleProfile ? shiftCycleStart(cycleProfile, 50) : [];
  const chartDataLeftStart = hasCycleProfile ? buildChartDataFromCycle(cycleProfileLeftStart) : [];
  const chartDataDualStart = hasCycleProfile
    ? chartDataRightStart.map((right, idx) => {
        const left = chartDataLeftStart[idx] ?? right;
        return {
          x: right.x,
          phase: right.phase,
          support_side: right.support_side,
          knee_right_delta_right_start: right.knee_right_delta,
          knee_right_delta_left_start: left.knee_right_delta,
          pelvic_tilt_right_start: right.pelvic_tilt,
          pelvic_tilt_left_start: left.pelvic_tilt,
          shoulder_tilt_right_start: right.shoulder_tilt,
          shoulder_tilt_left_start: left.shoulder_tilt,
          trunk_sway_right_start: right.trunk_sway,
          trunk_sway_left_start: left.trunk_sway,
          com_lateral_right_start: right.com_lateral,
          com_lateral_left_start: left.com_lateral,
        };
      })
    : [];

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 py-4 px-6 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-slate-800">療法士向け分析レポート</h1>
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-mono">ID: {caseId}</span>
          </div>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-800 transition">
            &larr; トップに戻る
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {skeletonVideoSrc && <SkeletonPlayer videoSrc={skeletonVideoSrc} defaultFps={30} caseId={caseId} />}

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-6">歩行分析プレビュー</h2>

              {review?.metrics ? (
                <div className="space-y-8">
                  <MetricsBarChart metrics={review.metrics} />
                  <div className="pt-6 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-500 mb-4">左右差比較</h3>
                    <LeftRightCompareChart
                      leftValue={review.metrics.knee_alignment_l?.value || 0}
                      rightValue={review.metrics.knee_alignment_r?.value || 0}
                      label="膝の傾き"
                      unit="°"
                    />
                  </div>

                  <div className="pt-6 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-500 mb-4">
                      {hasCycleProfile
                        ? `詳細時系列グラフ（歩行周期1-100%平均 / ${results?.cycles_used ?? 0}周期）`
                        : "詳細時系列グラフ"}
                    </h3>
                    {cycleQuality && (
                      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">
                          推定信頼度: {cycleQuality.score.toFixed(1)} / 100
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          周期性 {cycleQuality.periodicity.toFixed(1)} / 一貫性 {cycleQuality.consistency.toFixed(1)} / 使用周期数 {cycleQuality.cycles_used}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">{cycleQuality.note}</p>
                      </div>
                    )}
                    {trendPoints.length > 0 || hasCycleProfile ? (
                      <div className="space-y-8">
                        {hasCycleProfile && (
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <MetricTrendCard
                              title="膝内反・外反"
                              unit="°"
                              data={chartDataDualStart}
                              xLabel="歩行周期(%)"
                              showGaitBands
                              series={[
                                {
                                  key: "knee_right_delta_right_start",
                                  label: "右歩行周期",
                                  color: "#0e7490",
                                  upperLabel: "外反寄り",
                                  lowerLabel: "内反寄り",
                                  baseline: 0,
                                },
                                {
                                  key: "knee_right_delta_left_start",
                                  label: "左歩行周期",
                                  color: "#7c3aed",
                                  upperLabel: "外反寄り",
                                  lowerLabel: "内反寄り",
                                  baseline: 0,
                                  dash: "6 3",
                                },
                              ]}
                            />
                            <MetricTrendCard
                              title="骨盤傾斜"
                              unit="°"
                              data={chartDataDualStart}
                              xLabel="歩行周期(%)"
                              showGaitBands
                              series={[
                                {
                                  key: "pelvic_tilt_right_start",
                                  label: "右歩行周期",
                                  color: "#0f766e",
                                  upperLabel: "右骨盤下制",
                                  lowerLabel: "左骨盤下制",
                                },
                                {
                                  key: "pelvic_tilt_left_start",
                                  label: "左歩行周期",
                                  color: "#7c3aed",
                                  upperLabel: "右骨盤下制",
                                  lowerLabel: "左骨盤下制",
                                  dash: "6 3",
                                },
                              ]}
                            />
                            <MetricTrendCard
                              title="肩傾斜"
                              unit="°"
                              data={chartDataDualStart}
                              xLabel="歩行周期(%)"
                              showGaitBands
                              series={[
                                {
                                  key: "shoulder_tilt_right_start",
                                  label: "右歩行周期",
                                  color: "#7c3aed",
                                  upperLabel: "右肩下制",
                                  lowerLabel: "左肩下制",
                                },
                                {
                                  key: "shoulder_tilt_left_start",
                                  label: "左歩行周期",
                                  color: "#0ea5e9",
                                  upperLabel: "右肩下制",
                                  lowerLabel: "左肩下制",
                                  dash: "6 3",
                                },
                              ]}
                            />
                            <MetricTrendCard
                              title="体幹傾斜"
                              unit={trunkUnit}
                              data={chartDataDualStart}
                              xLabel="歩行周期(%)"
                              showGaitBands
                              series={[
                                {
                                  key: "trunk_sway_right_start",
                                  label: "右歩行周期",
                                  color: "#be123c",
                                  upperLabel: "右偏位",
                                  lowerLabel: "左偏位",
                                },
                                {
                                  key: "trunk_sway_left_start",
                                  label: "左歩行周期",
                                  color: "#f97316",
                                  upperLabel: "右偏位",
                                  lowerLabel: "左偏位",
                                  dash: "6 3",
                                },
                              ]}
                            />
                            <MetricTrendCard
                              title="身体重心（COM）左右移動"
                              unit={comUnit}
                              data={chartDataDualStart}
                              xLabel="歩行周期(%)"
                              showGaitBands
                              series={[
                                {
                                  key: "com_lateral_right_start",
                                  label: "右歩行周期",
                                  color: "#1d4ed8",
                                  upperLabel: "右へ移動",
                                  lowerLabel: "左へ移動",
                                },
                                {
                                  key: "com_lateral_left_start",
                                  label: "左歩行周期",
                                  color: "#0891b2",
                                  upperLabel: "右へ移動",
                                  lowerLabel: "左へ移動",
                                  dash: "6 3",
                                },
                              ]}
                            />
                          </div>
                        )}
                        {!hasCycleProfile && (
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <MetricTrendCard
                              title="膝内反・外反（右/左）"
                              unit="°"
                              data={chartDataRightStart}
                              xLabel="frame"
                              showGaitBands={false}
                              series={[
                                {
                                  key: "knee_right_delta",
                                  label: "右膝",
                                  color: "#0e7490",
                                  upperLabel: "外反寄り",
                                  lowerLabel: "内反寄り",
                                  baseline: 0,
                                  rawKey: "knee_right",
                                  rawUnit: "°",
                                },
                                {
                                  key: "knee_left_delta",
                                  label: "左膝",
                                  color: "#7c3aed",
                                  upperLabel: "外反寄り",
                                  lowerLabel: "内反寄り",
                                  baseline: 0,
                                  rawKey: "knee_left",
                                  rawUnit: "°",
                                  dash: "6 3",
                                },
                              ]}
                            />
                            <MetricTrendCard
                              title="骨盤傾斜"
                              unit="°"
                              data={chartDataRightStart}
                              xLabel="frame"
                              showGaitBands={false}
                              series={[
                                {
                                  key: "pelvic_tilt",
                                  label: "骨盤傾斜",
                                  color: "#0f766e",
                                  upperLabel: "右骨盤下制",
                                  lowerLabel: "左骨盤下制",
                                },
                              ]}
                            />
                            <MetricTrendCard
                              title="肩傾斜"
                              unit="°"
                              data={chartDataRightStart}
                              xLabel="frame"
                              showGaitBands={false}
                              series={[
                                {
                                  key: "shoulder_tilt",
                                  label: "肩傾斜",
                                  color: "#7c3aed",
                                  upperLabel: "右肩下制",
                                  lowerLabel: "左肩下制",
                                },
                              ]}
                            />
                            <MetricTrendCard
                              title="体幹傾斜"
                              unit={trunkUnit}
                              data={chartDataRightStart}
                              xLabel="frame"
                              showGaitBands={false}
                              series={[
                                {
                                  key: "trunk_sway",
                                  label: "体幹偏位",
                                  color: "#be123c",
                                  upperLabel: "右偏位",
                                  lowerLabel: "左偏位",
                                },
                              ]}
                            />
                            <MetricTrendCard
                              title="身体重心（COM）左右移動"
                              unit={comUnit}
                              data={chartDataRightStart}
                              xLabel="frame"
                              showGaitBands={false}
                              series={[
                                {
                                  key: "com_lateral",
                                  label: "COM左右移動",
                                  color: "#1d4ed8",
                                  upperLabel: "右へ移動",
                                  lowerLabel: "左へ移動",
                                },
                              ]}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-6 text-sm text-slate-500">
                        時系列データがないため、詳細グラフは表示できませんでした。
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">
                  データを読み込み中です...
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-4">解析サマリ</h2>
              <p className="text-sm text-slate-600 leading-relaxed font-medium whitespace-pre-line">
                {review?.review_data?.summary || "解析中..."}
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-4">評価コメント</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">所見</h3>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{review?.review_data?.findings}</p>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-red-500 uppercase mb-2">課題領域</h3>
                  <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-sm text-red-800 leading-relaxed whitespace-pre-line">
                    {review?.review_data?.problem_areas}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">解釈</h3>
                  <p className="text-sm text-slate-600 leading-relaxed italic border-l-2 border-slate-300 pl-3 whitespace-pre-line">
                    {review?.review_data?.interpretation}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100 shadow-sm">
              <h3 className="font-bold text-indigo-900 mb-4">臨床提案</h3>
              <div className="text-sm text-indigo-800 leading-relaxed whitespace-pre-wrap">
                {review?.review_data?.clinical_suggestions}
              </div>
            </div>

            <Link
              href={`/patient/${caseId}`}
              className="block w-full py-4 text-center rounded-xl bg-slate-800 text-white font-medium hover:bg-slate-700 transition shadow-lg"
            >
              患者向けレポートを表示 &rarr;
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

