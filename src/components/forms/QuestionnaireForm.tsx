"use client";

import { useState } from "react";
import type { QuestionnaireData } from "@/lib/api";

interface QuestionnaireFormProps {
    onSubmit: (data: QuestionnaireData, video: File) => void;
    isLoading?: boolean;
}

export default function QuestionnaireForm({
    onSubmit,
    isLoading = false,
}: QuestionnaireFormProps) {
    const [formData, setFormData] = useState<QuestionnaireData>({
        name: "",
        age: 0,
        sex: "未選択",
        height: 0,
        weight: 0,
        chief: "",
        goal: "",
        lifestyle_detail: "",
        job: "",
        exercise: "",
    });
    const [video, setVideo] = useState<File | null>(null);

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        const { name, value, type } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "number" ? parseInt(value) || 0 : value,
        }));
    };

    const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setVideo(e.target.files[0]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!video) {
            alert("動画をアップロードしてください");
            return;
        }
        if (!formData.name) {
            alert("お名前を入力してください");
            return;
        }
        onSubmit(formData, video);
    };

    const bmi =
        formData.height > 0 && formData.weight > 0
            ? (formData.weight / Math.pow(formData.height / 100, 2)).toFixed(1)
            : null;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* 基本情報 */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-blue-900 mb-4">基本情報</h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            お名前 <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                            placeholder="山田 太郎"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                年齢
                            </label>
                            <input
                                type="number"
                                name="age"
                                value={formData.age || ""}
                                onChange={handleInputChange}
                                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                                placeholder="30"
                                min={0}
                                max={120}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                性別
                            </label>
                            <select
                                name="sex"
                                value={formData.sex}
                                onChange={handleInputChange}
                                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition bg-white"
                            >
                                <option value="未選択">未選択</option>
                                <option value="男性">男性</option>
                                <option value="女性">女性</option>
                                <option value="その他">その他</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                身長 (cm)
                            </label>
                            <input
                                type="number"
                                name="height"
                                value={formData.height || ""}
                                onChange={handleInputChange}
                                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                                placeholder="170"
                                min={0}
                                max={250}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                体重 (kg)
                            </label>
                            <input
                                type="number"
                                name="weight"
                                value={formData.weight || ""}
                                onChange={handleInputChange}
                                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                                placeholder="60"
                                min={0}
                                max={300}
                            />
                        </div>
                    </div>

                    {bmi && (
                        <div className="bg-blue-50 rounded-lg px-4 py-2 text-center">
                            <span className="text-sm text-blue-800">BMI: {bmi}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* 主訴と目標 */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-blue-900 mb-4">主訴と目標</h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            主訴・気になること
                        </label>
                        <textarea
                            name="chief"
                            value={formData.chief}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition min-h-[100px]"
                            placeholder="膝の痛み、歩行時の不安定感など"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            目標
                        </label>
                        <textarea
                            name="goal"
                            value={formData.goal}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition min-h-[80px]"
                            placeholder="痛みの軽減、スポーツパフォーマンス向上など"
                        />
                    </div>
                </div>
            </div>

            {/* 生活スタイル */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-blue-900 mb-4">生活スタイル</h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            お仕事
                        </label>
                        <input
                            type="text"
                            name="job"
                            value={formData.job}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                            placeholder="会社員、主婦、学生など"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            運動習慣
                        </label>
                        <input
                            type="text"
                            name="exercise"
                            value={formData.exercise}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
                            placeholder="週3回ジョギング、月1回ゴルフなど"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            生活スタイルの詳細
                        </label>
                        <textarea
                            name="lifestyle_detail"
                            value={formData.lifestyle_detail}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition min-h-[80px]"
                            placeholder="デスクワーク中心、立ち仕事など"
                        />
                    </div>
                </div>
            </div>

            {/* 動画アップロード */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-blue-900 mb-4">歩行動画</h3>

                <div className="border-2 border-dashed border-blue-300 rounded-xl p-6 text-center bg-blue-50">
                    <div className="mb-3">
                        <svg
                            className="w-12 h-12 mx-auto text-blue-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                        </svg>
                    </div>

                    <label className="block">
                        <span className="text-sm text-slate-600 mb-2 block">
                            背面からの歩行動画をアップロード
                        </span>
                        <input
                            type="file"
                            accept="video/*"
                            onChange={handleVideoChange}
                            className="hidden"
                        />
                        <span className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition font-medium">
                            動画を選択
                        </span>
                    </label>

                    {video && (
                        <div className="mt-4 text-sm text-green-600 font-medium">
                            ✓ {video.name}
                        </div>
                    )}
                </div>

                <div className="mt-3 text-xs text-slate-500 space-y-1">
                    <p>• カメラは背面から、全身が映るように撮影</p>
                    <p>• 10〜30秒程度、普段通りの速度で歩行</p>
                    <p>• 対応形式: MP4, MOV, MKV, AVI</p>
                </div>
            </div>

            {/* 送信ボタン */}
            <button
                type="submit"
                disabled={isLoading || !video}
                className={`w-full py-4 rounded-xl font-bold text-lg transition ${isLoading || !video
                        ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                        : "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-cyan-600"
                    }`}
            >
                {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                            />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                        </svg>
                        解析中...
                    </span>
                ) : (
                    "歩行解析を開始"
                )}
            </button>
        </form>
    );
}
