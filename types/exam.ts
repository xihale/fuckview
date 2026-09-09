// exam-service 相关类型（弹窗答题 / 作业答题 / 测验）
// 逆向自 AnyView 学生端 v2025.9 前端 bundle (student428b7b3c.js, 含 sourcesContent)
// 详见 analysis/07-exam-service.md

// ===== 通用响应封装：真身移至 common.ts，re-export 保持旧 import 兼容 =====
export type { ApiResponse } from "./common.ts";
// 课后作业类型真身在 homework.ts，同样 re-export 兼容
export type { AppendixData, HomeWorkQuestion, HomeWorkQuestionList } from "./homework.ts";
export { HOMEWORK_STATUS } from "./homework.ts";

// ===== 实验题内嵌练习题（做题页弹窗）=====
// 题目类型码 lab-coding-description.vue（2026-09-07 实测核对）:
//   1 单选题 / 2 多选题 / 3 解答题 / 4 编程题(函数补全/改错) / 5 编程题(整文件实现, 如 Main.cpp)
// 弹窗按钮嵌在题面三段 HTML 里: <button id="p_{practiceQuestionId}" class="practice_question_button">
export interface PracticeQuestion {
    practiceQuestionId: number;
    point?: number;
    finishTime?: string | null;
    pq?: {
        // 题干 (HTML)
        questionStem: string;
        // 选项数组 [{content: "..."}]
        optionSelects: Array<{ content: string }>;
        // 1 单选 2 多选 3 解答 4 编程
        type: number;
        remark?: string;
    } | null;
}

// 自己提交过的一条答案 (GET .../get/exercise/{labId} 的元素)
export interface PracticeOwnAnswer {
    practiceQuestionId: number;
    pqe: {
        // Base64；选择题为 "[true,false,...]"，解答/编程题为 HTML 文本
        exerciseContent: string;
        isTempSaved?: boolean | string;
    };
    // 有标准答案时后端一并返回 (提交后可见)
    pqd?: {
        optionSolution?: string;
        solutionContent?: string;
    } | null;
}

/** POST /lab/practice/submit 提交体（isTempSaved=true 草稿 / false 终交并公布答案） */
export interface PracticeSubmitRequest {
    practiceQuestionId: number;
    /** Base64(答案原文)：选择题为 "[true,false,...]" 数组字面量；解答/编程为 HTML */
    exerciseContent: string;
    isTempSaved: boolean;
}

// ===== 测验（WebSocket / HTTP 双通道）=====
// ws.js types.js 的状态码
export const EXAM_WS_TYPE = {
    HEART_BEAT: 117,
    LOGIN_OUT: 119,
    START_EXAM: 201,
    EXPAND_EXAM: 202,
    OVER_EXAM: 203,
    SUBMIT_SUCCESS: 204,
    PREPARE_EXAM: 205,
    NO_EXAM: 212,
    GET_EXAM_INFO: 206,
    GET_QUESTION_LIST: 207,
    SUBMIT_EXAM: 208,
    GET_QUESTION_LIST_OK: 210,
    GET_HISTORY: 215,
    GET_HISTORY_OK: 216,
    CHECK_SUBMIT: 217,
    HAVE_SUBMITED: 218,
    NOT_SUBMITED: 219,
    ACK: 222,
    TIMER: 401,
} as const;

// WS 消息: 发送方 {type, content?, timestamp, token}；响应附 timestamp 回带
export interface ExamWsMessage {
    type: number;
    content?: unknown;
    timestamp?: string;
    token?: string;
    /** 403 = 页面停留过久被要求断开重连 */
    statusType?: number;
    currentTime?: string;
    [k: string]: unknown;
}

/** 测验推送的考试内容（201/202/203 等 type 的 content），交卷参数从中取 */
export interface ExamContent {
    /** 考试 id（=schemeId） */
    vId: number;
    classId: number;
    [k: string]: unknown;
}

/** 交卷参数（submitExam HTTP multipart / WS 208 的 content，取自 ExamContent） */
export interface ExamSubmitRequest {
    schemeId: number;
    classId: number;
    vId: number;
}

/** WS 207 getOneScheme 响应：content.catalogs 为题目目录 */
export interface ExamQuestionListContent {
    catalogs: Array<Record<string, unknown>>;
    [k: string]: unknown;
}
