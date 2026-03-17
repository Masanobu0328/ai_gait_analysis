"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PentagonRadarChart from "@/components/charts/RadarChart";
import SkeletonPlayer from "@/components/charts/SkeletonPlayer";
import {
  getPatientReview,
  getResults,
  type PatientReview,
  type AnalysisResults,
} from "@/lib/api";

function resolveBackendOrigin(): string {
  if (typeof window !== "undefined") {
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

export default function PatientResultPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params.caseId as string;

  const [review, setReview] = useState<PatientReview | null>(null);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reviewData, resultsData] = await Promise.all([
          getPatientReview(caseId),
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
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600">データを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 flex items-center justify-center p-4">
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

  const scoreItems = review?.radar_scores
    ? [
        { label: "骨盤", value: Math.round(review.radar_scores.pelvic_tilt / 5) },
        { label: "肩", value: Math.round(review.radar_scores.shoulder_tilt / 5) },
        { label: "膝", value: Math.round(review.radar_scores.knee_alignment / 5) },
        { label: "頭部", value: Math.round(review.radar_scores.head_tilt / 5) },
        { label: "体幹", value: Math.round(review.radar_scores.trunk_stability / 5) },
      ].map((item) => ({ ...item, value: Math.max(0, Math.min(20, item.value)) }))
    : [];

  const totalScore = scoreItems.reduce((sum, item) => sum + item.value, 0);
  const skeletonVideoSrc = results?.skeleton_video_url
    ? `${resolveBackendOrigin()}${results.skeleton_video_url}`
    : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 pb-20">
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 text-white py-6 px-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">歩行分析レポート</h1>
            <p className="text-blue-200 text-xs">AIによる患者向け評価</p>
          </div>
          <Link href="/" className="text-xs bg-white/20 px-3 py-1 rounded-full hover:bg-white/30 transition">
            トップへ
          </Link>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-8">
        {skeletonVideoSrc && <SkeletonPlayer videoSrc={skeletonVideoSrc} defaultFps={30} caseId={caseId} />}

        <section className="bg-white rounded-2xl p-6 shadow-md border border-slate-100">
          <h2 className="text-lg font-bold text-blue-900 mb-4 border-b-2 border-blue-100 pb-2">総合バランス評価</h2>
          <div className="mb-4">
            <p className="text-sm text-slate-600">100点満点（各項目20点）</p>
            <p className="text-3xl font-extrabold text-blue-700 mt-1">
              {totalScore}
              <span className="text-lg font-semibold text-slate-500"> / 100</span>
            </p>
          </div>
          <div className="grid grid-cols-5 gap-2 text-center">
            {scoreItems.map((item) => (
              <div key={item.label} className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                <p className="text-[11px] text-slate-500">{item.label}</p>
                <p className="text-sm font-bold text-slate-800">{item.value}/20</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl p-6 shadow-md border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-cyan-400" />
          <h2 className="text-xl font-bold text-slate-800 mb-4 text-center">5項目バランス</h2>
          {review?.radar_scores ? (
            <PentagonRadarChart scores={review.radar_scores} />
          ) : (
            <div className="h-64 flex items-center justify-center bg-slate-50 rounded-xl">
              <p className="text-slate-400 text-sm">データ読み込み中...</p>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl p-6 shadow-md border border-slate-100">
          <h2 className="text-lg font-bold text-blue-900 mb-4 border-b-2 border-blue-100 pb-2">歩行のまとめ</h2>
          <div className="text-slate-700 leading-relaxed font-medium whitespace-pre-line">
            {review?.review_data?.overview || "解析結果を読み込み中です..."}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-amber-700 px-2">気になるポイント</h2>
          <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100 shadow-sm">
            <div className="text-slate-800 leading-relaxed whitespace-pre-line">
              {review?.review_data?.concerns || "特に大きな偏りは確認できませんでした。"}
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-br from-white to-blue-50 rounded-2xl p-6 shadow-md border border-blue-100">
          <h2 className="text-lg font-bold text-blue-900 mb-4">考えられる原因と改善の提案</h2>

          <div className="mb-6">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">考えられる要因</h3>
            <div className="bg-white/60 rounded-xl p-4 text-slate-700 text-sm border border-blue-100 whitespace-pre-line">
              {review?.review_data?.causes || "データなし"}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">改善のアドバイス</h3>
            <div className="bg-white rounded-xl p-5 border-l-4 border-cyan-500 shadow-sm">
              <p className="text-slate-800 font-bold leading-relaxed whitespace-pre-line">
                {review?.review_data?.advice || "データなし"}
              </p>
            </div>
          </div>
        </section>

        <div className="pt-4">
          <Link
            href={`/therapist/${caseId}`}
            className="block w-full py-4 text-center rounded-xl bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700 transition"
          >
            療法士向けデータを見る
          </Link>
        </div>
      </div>
    </main>
  );
}
