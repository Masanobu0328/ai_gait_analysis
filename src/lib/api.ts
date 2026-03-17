import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100/api/v1";

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 300000, // 5 minutes for video upload
});

// Types
export interface QuestionnaireData {
    name: string;
    age: number;
    sex: string;
    height: number;
    weight: number;
    chief: string;
    goal: string;
    lifestyle_detail: string;
    job: string;
    exercise: string;
}

export interface RadarScore {
    pelvic_tilt: number;
    shoulder_tilt: number;
    knee_alignment: number;
    head_tilt: number;
    trunk_stability: number;
}

export interface MetricValue {
    value: number;
    unit: string;
    status: string;
    reference?: string;
}

export interface AnalysisUploadResponse {
    case_id: string;
    patient_id: string;
    message: string;
    status: string;
}

export interface AnalysisStatusResponse {
    case_id: string;
    status: "pending" | "processing" | "completed" | "failed";
    message: string;
    progress?: number;
}

export interface MetricTrendPoint {
    frame: number;
    phase: string;
    support_side: string;
    cycle_index: number;
    cycle_percent: number;
    pelvic_tilt: number;
    shoulder_tilt: number;
    trunk_sway: number;
    com_lateral: number;
    knee_asymmetry: number;
    knee_right: number;
    knee_left: number;
}

export interface MetricCyclePoint {
    gait_percent: number;
    phase: string;
    support_side: string;
    pelvic_tilt: number;
    shoulder_tilt: number;
    trunk_sway: number;
    com_lateral: number;
    knee_asymmetry: number;
    knee_right: number;
    knee_left: number;
}

export interface CycleProfileQuality {
    score: number;
    level: "high" | "medium" | "low";
    cycles_used: number;
    periodicity: number;
    consistency: number;
    note: string;
}

export interface AnalysisResults {
    case_id: string;
    patient_id: string;
    timestamp: string;
    radar_scores: RadarScore;
    metrics: Record<string, MetricValue>;
    trend_points: MetricTrendPoint[];
    cycle_profile: MetricCyclePoint[];
    cycles_used: number;
    cycle_quality?: CycleProfileQuality | null;
    trunk_sway_unit: string;
    com_lateral_unit: string;
    height_cm_used?: number | null;
    skeleton_video_url?: string;
}

export interface PatientReviewData {
    overview: string;
    concerns: string;
    causes: string;
    advice: string;
}

export interface PatientReview {
    case_id: string;
    review_data: PatientReviewData;
    radar_scores: RadarScore;
    improvement_points: string[];
}

export interface TherapistReviewData {
    summary: string;
    findings: string;
    problem_areas: string;
    interpretation: string;
    clinical_suggestions: string;
    limitations: string;
}

export interface TherapistReview {
    case_id: string;
    review_data: TherapistReviewData;
    metrics: Record<string, MetricValue>;
    clinical_suggestions: string[];
}

// API Functions
export async function uploadAndAnalyze(
    video: File,
    questionnaire: QuestionnaireData,
    skipVideo: boolean = false
): Promise<AnalysisUploadResponse> {
    const formData = new FormData();
    formData.append("front_video", video);
    formData.append("name", questionnaire.name);
    formData.append("age", questionnaire.age.toString());
    formData.append("sex", questionnaire.sex);
    formData.append("height", questionnaire.height.toString());
    formData.append("weight", questionnaire.weight.toString());
    formData.append("chief", questionnaire.chief);
    formData.append("goal", questionnaire.goal);
    formData.append("lifestyle_detail", questionnaire.lifestyle_detail);
    formData.append("job", questionnaire.job);
    formData.append("exercise", questionnaire.exercise);
    formData.append("skip_video", skipVideo.toString());

    const response = await api.post<AnalysisUploadResponse>("/analysis/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
}

export async function getAnalysisStatus(caseId: string): Promise<AnalysisStatusResponse> {
    const response = await api.get<AnalysisStatusResponse>(`/analysis/${caseId}/status`);
    return response.data;
}

export async function getResults(caseId: string): Promise<AnalysisResults> {
    const response = await api.get<AnalysisResults>(`/results/${caseId}`);
    return response.data;
}

export async function getPatientReview(caseId: string): Promise<PatientReview> {
    const response = await api.get<PatientReview>(`/reviews/${caseId}/patient`);
    return response.data;
}

export async function getTherapistReview(caseId: string): Promise<TherapistReview> {
    const response = await api.get<TherapistReview>(`/reviews/${caseId}/therapist`);
    return response.data;
}

export default api;
