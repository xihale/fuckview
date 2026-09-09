// exam-service · 课后作业（HomeWork 页面）类型（analysis/07-exam-service.md §C）

export interface AppendixData {
    realFileName: string;
    time: string;
}

export interface HomeWorkQuestion {
    practiceContent: { id: number; [k: string]: unknown };
    stuAnswer?: { exerciseContent?: string } | null;
    appendix?: unknown;
    [k: string]: unknown;
}

export interface HomeWorkQuestionList {
    courseName?: string;
    practiceName?: string;
    practiceQuestionList: HomeWorkQuestion[];
}

/** GET /practice/exercise/get/status/{practiceId} 的语义 */
export const HOMEWORK_STATUS = {
    /** 2 = 已截止（前端 DoHomeWork.vue） */
    CLOSED: 2,
} as const;
