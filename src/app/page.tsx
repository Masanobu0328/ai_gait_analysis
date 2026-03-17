"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import QuestionnaireForm from "@/components/forms/QuestionnaireForm";
import {
  uploadAndAnalyze,
  getAnalysisStatus,
  type QuestionnaireData,
  type AnalysisStatusResponse,
} from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<AnalysisStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: QuestionnaireData, video: File) => {
    setIsLoading(true);
    setError(null);
    setStatus(null);

    try {
      const response = await uploadAndAnalyze(video, data);

      // Poll for status
      const pollStatus = async () => {
        try {
          const statusResponse = await getAnalysisStatus(response.case_id);
          setStatus(statusResponse);

          if (statusResponse.status === "completed") {
            setIsLoading(false);
            router.push(`/patient/${response.case_id}`);
          } else if (statusResponse.status === "failed") {
            setIsLoading(false);
            setError(statusResponse.message || "解析に失敗しました");
          } else {
            // Continue polling
            setTimeout(pollStatus, 2000);
          }
        } catch (err) {
          setIsLoading(false);
          setError("ステータス確認中にエラーが発生しました");
        }
      };

      pollStatus();
    } catch (err) {
      setIsLoading(false);
      setError("アップロードに失敗しました。もう一度お試しください。");
      console.error(err);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 text-white py-6 px-4 shadow-lg">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-center">歩行解析AI</h1>
          <p className="text-blue-200 text-center text-sm mt-1">
            AI技術を活用した歩行分析システム
          </p>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-md mx-auto px-4 py-6">
        {/* ステータス表示 */}
        {isLoading && status && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              <div>
                <p className="font-medium text-blue-900">
                  {status.status === "processing" ? "解析中..." : "準備中..."}
                </p>
                {status.progress !== undefined && (
                  <div className="w-full bg-blue-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${status.progress * 100}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* フォーム */}
        <QuestionnaireForm onSubmit={handleSubmit} isLoading={isLoading} />
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-slate-500">
        <p>© 2024 Takumi Insole System</p>
      </footer>
    </main>
  );
}
