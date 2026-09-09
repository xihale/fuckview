// AnyView exam-service 接口封装: 弹窗答题(实验题练习题) / 作业 / 测验
// 逆向自学生端前端 bundle (student428b7b3c.js, 带 sourcesContent):
//
// 1) 弹窗答题 = 实验题(LabCoding)描述页里的 el-dialog。
//    课前预习/课堂学习/课后复习 的 HTML 中嵌有 <button id="前缀_id">，
//    点击后弹窗展示题目(单选/多选/解答/编程)，POST 提交。
//    答案格式:
//      - 选择题: "[true,false,...]" (与选项等长的字符串数组字面量)
//      - 解答题/编程题: HTML 文本
//      - 两者都 Base64 编码后放 exerciseContent
//    提交后 isTempSaved=false 会锁定并显示参考答案。
//
// 2) 作业(HomeWork/DoHomeWork 页面): 整卷 get -> 逐题作答 -> 一次性 submit。
//
// 3) 测验(Exams): WebSocket 推送考试安排，题目列表/交卷走 WS 或 HTTP 表单
//    (examReInfoJsonStr 字段)。WS 帧格式 {type, content?, timestamp, token}。
//
// 全局约定: 请求头带小写 `token`，响应封装 {code, data, message}，成功码 200/0。

import { config, header } from "./config";
import type {
    ApiResponse,
    PracticeQuestion,
    PracticeOwnAnswer,
    HomeWorkQuestionList,
} from "../types/exam";

const EXAM_HTTP = "https://anyview.gdut.edu.cn/api/exam-service";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
    return { ...header, Token: config.token, ...extra };
}

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { method: "GET", headers: authHeaders() });
    if (!res.ok) {
        throw new Error(`GET ${url} HTTP ${res.status}`);
    }
    return (await res.json()) as T;
}

export function b64(s: string): string {
    return Buffer.from(s, "utf-8").toString("base64");
}

// ============ 1. 实验题内嵌练习题（弹窗答题） ============

// 注意两套 ID 语义（2026-09-07 实测确认）:
//   - get/question 用「题面 questionId」(scheme/list/student/lab/{eid} 的 data.questionId)
//   - get/exercise 用「目录 eid」(catalog 的 eid，即 URL 里的实验题 id)
// 传反会拿到空列表 / "练习题不存在"。

// 实验题题面（2026 版结构: doc 为空, 正文在 beforeClass/onClass/afterClass 三段 HTML 里,
// 弹窗按钮 <button id="p_{practiceQuestionId}" class="practice_question_button"> 嵌在其中）
export interface LabQuestionMeta {
    questionFullName: string;
    questionId: number;
    onClass?: string;
    beforeClass?: string;
    afterClass?: string;
    language?: number;
    completes?: Array<{ id: number; value: string; score: number; questionId: number }>;
    stuCode?: string;
}

export async function getLabQuestionMeta(eid: number | string): Promise<LabQuestionMeta> {
    const payload = await getJson<ApiResponse<LabQuestionMeta>>(
        `https://anyview.gdut.edu.cn/api/scheme-service/scheme/list/student/lab/${eid}`,
    );
    return payload.data;
}

// 某道实验题里的全部练习题(题目+选项+分值) —— 第二个参数是「题面 questionId」
export async function getLabPracticeQuestions(
    schemeId: number | string,
    labExerciseId: number | string,
): Promise<PracticeQuestion[]> {
    const payload = await getJson<ApiResponse<PracticeQuestion[]>>(
        `${EXAM_HTTP}/lab/practice/get/question/${schemeId}/${labExerciseId}`,
    );
    return payload.data ?? [];
}

// 某道实验题里自己提交过的全部答案(含提交后可见的参考答案)
export async function getLabOwnAnswers(
    labExerciseId: number | string,
): Promise<PracticeOwnAnswer[]> {
    const payload = await getJson<ApiResponse<PracticeOwnAnswer[]>>(
        `${EXAM_HTTP}/lab/practice/get/exercise/${labExerciseId}`,
    );
    return payload.data ?? [];
}

// 单道练习题自己的答案 + 参考答案(practiceQuestionSolution)
export async function getOneLabOwnAnswer(
    practiceQuestionId: number | string,
): Promise<PracticeOwnAnswer> {
    const payload = await getJson<ApiResponse<PracticeOwnAnswer>>(
        `${EXAM_HTTP}/lab/practice/get/exercise/one/${practiceQuestionId}`,
    );
    return payload.data;
}

// 提交/暂存一道练习题。isTempSaved=true 暂存(可改)，false 定稿(锁定+显示答案)。
export async function submitLabPracticeAnswer(args: {
    practiceQuestionId: number | string;
    // 原文; 选择题传 "[true,false,...]"，文本题传内容
    exerciseContent: string;
    isTempSaved: boolean;
}): Promise<ApiResponse> {
    const res = await fetch(`${EXAM_HTTP}/lab/practice/submit`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
            practiceQuestionId: args.practiceQuestionId,
            exerciseContent: b64(args.exerciseContent),
            isTempSaved: args.isTempSaved,
        }),
    });
    return (await res.json()) as ApiResponse;
}

// ============ 2. 作业（HomeWork） ============

export async function getHomeWorkList(params: {
    courseId?: number | string;
    [k: string]: unknown;
}): Promise<unknown[]> {
    const url = new URL(`${EXAM_HTTP}/practice/exercise/list`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const payload = await getJson<ApiResponse<unknown[]>>(url.toString());
    return payload.data ?? [];
}

export async function getHomeWorkQuestion(
    practiceId: number | string,
): Promise<HomeWorkQuestionList> {
    const payload = await getJson<ApiResponse<HomeWorkQuestionList>>(
        `${EXAM_HTTP}/practice/exercise/get/question/${practiceId}`,
    );
    return payload.data;
}

export async function getHomeWorkSelfAnswer(
    practiceId: number | string,
): Promise<unknown[]> {
    const payload = await getJson<ApiResponse<unknown[]>>(
        `${EXAM_HTTP}/practice/exercise/get/exercise/${practiceId}`,
    );
    return payload.data ?? [];
}

// 整卷提交: practiceQuestionExercises = [{practiceContentId, exerciseContent}]
export async function submitHomeWork(args: {
    practiceId: number | string;
    practiceQuestionExercises: Array<{ practiceContentId: number; exerciseContent: string }>;
}): Promise<ApiResponse> {
    const res = await fetch(`${EXAM_HTTP}/practice/exercise/submit`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(args),
    });
    return (await res.json()) as ApiResponse;
}

// 作业状态: 2 = 已截止
export async function getHomeWorkStatus(practiceId: number | string): Promise<number> {
    const payload = await getJson<ApiResponse<number>>(
        `${EXAM_HTTP}/practice/exercise/get/status/${practiceId}`,
    );
    return payload.data;
}

export async function getHomeWorkScore(practiceId: number | string): Promise<unknown> {
    const payload = await getJson<ApiResponse<unknown>>(
        `${EXAM_HTTP}/practice/exercise/get/score/${practiceId}`,
    );
    return payload.data;
}

// 有练习发布过的课程 id 列表（课程卡片上的"作业"角标数据源）
export async function getCoursesWithHomeWork(): Promise<number[]> {
    const payload = await getJson<ApiResponse<number[]>>(
        `${EXAM_HTTP}/course/get/filter/select`,
    );
    return payload.data ?? [];
}

// ============ 3. 测验（HTTP 通道；WS 见 docs） ============
// 这些端点前端用 multipart form，字段 examReInfoJsonStr = JSON.stringify(content)

async function postExamForm<T>(path: string, content: unknown): Promise<T> {
    const boundary = "----WebKitFormBoundary" + Math.random().toString(16).slice(2, 12);
    const body = [
        `------${boundary}`,
        'Content-Disposition: form-data; name="examReInfoJsonStr"',
        "",
        JSON.stringify(content),
        `------${boundary}--`,
        "",
    ].join("\r\n");
    const res = await fetch(`${EXAM_HTTP}/exam/${path}`, {
        method: "POST",
        headers: authHeaders({
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
        }),
        body,
    });
    return (await res.json()) as T;
}

// 考试安排(HistoryExam 面板数据源)
export async function getExamPlan(): Promise<ApiResponse> {
    return getJson<ApiResponse>(`${EXAM_HTTP}/exam/getExamPlan`);
}

// 测验题目列表: content = {vId, classId, ...}（getOneScheme）
export async function getExamQuestions(content: unknown): Promise<ApiResponse> {
    return postExamForm<ApiResponse>("getOneScheme", content);
}

// 交卷: content = {vId, classId}
export async function submitExam(content: unknown): Promise<ApiResponse> {
    return postExamForm<ApiResponse>("submitExam", content);
}

// 是否已交卷: content = {vId, classId}；type 218 已交 / 219 未交
export async function checkIfSubmited(content: unknown): Promise<ApiResponse> {
    return postExamForm<ApiResponse>("checkIfSubmited", content);
}

// 历史测验
export async function getHistoryExam(): Promise<ApiResponse> {
    return getJson<ApiResponse>(`${EXAM_HTTP}/exam/getHistoryExam`);
}

// 是否通过某测验的全部题目(提前交卷判定)
export async function isAllPassed(params: {
    vId: number | string;
    classId: number | string;
    [k: string]: unknown;
}): Promise<ApiResponse> {
    const url = new URL(`${EXAM_HTTP}/exam/isAllPassed`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    return getJson<ApiResponse>(url.toString());
}

// ============ 4. 测验 WebSocket ============
// wss://anyview.gdut.edu.cn/api/exam-service/websocket/{token}
// - 连接即发 {type:206} 询问考试安排；心跳 40s 一次 {type:117}
// - 收到 201/202/203/205/212 须回 {type:222} 确认
// - type 119 = token 失效/单点登录被踢
// - statusType 403 = 页面停留过长，回 {type:401, content:当前题id} 重连计时
// 发送封装: 帧加 timestamp=Date.now().toString() 和 token 字段，响应按 timestamp 配对。
