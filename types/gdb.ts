// gdb-service 类型（analysis/06-gdb-service.md）
// RunData / ApiResponse 在 common.ts
import type { RunData } from "./common.ts";

// ===== 编译 =====
export interface CompileData {
    /** 含 "编译成功" 即编译通过 */
    result: string;
    cmpRightCount: number;
    cmpErrorCount: number;
}

export interface CompileResponse {
    code: number;
    message: string;
    data: CompileData;
}

// ===== 成组判题 / 交互运行 =====
export interface RunGroupResponse {
    code: number;
    message: string;
    data: RunData;
}

export interface ExecuteInputResponse {
    code: number;
    message: string;
    data: RunData;
}

// ===== 存码 / 初始化 =====
/** POST /gdb-service/exercise/saveStudentCode（JSON，刷行为信号） */
export interface SaveStudentCodeBody {
    eID: string;
    /** Base64(代码原文) */
    studentCode: string;
}

/** PUT /gdb-service/code/init（实验题变体用） */
export interface InitStuInfoBody {
    languageId: number;
    /** 实验题 0 / 普通题 1（actions.js: questionType===2 → workType=0） */
    workType: number;
}

// ===== 实验题 / 课程设计（JSON body 变体，header: Eid） =====
export interface LabCodeInfo {
    /** 原 fileName；编译请求里会被删掉并改写为 path */
    fileName?: string;
    path?: string;
    /** Base64(文件代码) */
    codeContent: string;
    saveStatus?: boolean;
    breakPoints?: string | unknown[];
    [k: string]: unknown;
}

export interface LabCompileRequest {
    questionFullName: string;
    /** 课程设计变体改名为 courseDesignExerciseId */
    labExerciseId: number;
    codeInfos: LabCodeInfo[];
    isTeacher: boolean;
    isDebug: boolean;
    courseDesignExerciseId?: number;
}
