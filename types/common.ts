// ===== 通用响应封装（所有 user/exercise/scheme/gdb/exam 服务共用）=====
// 前端 protocol/http.ts: 成功码 = [200, 0]，废弃兼容码 = [31, 41, 70]，其余失败
export const SUCCESS_CODES = [200, 0] as const;
export const DEPRECATED_SUCCESS_CODES = [31, 41, 70] as const;

export interface ApiResponse<T = unknown> {
    code: number;
    message?: string;
    data: T;
}

/** gdb-service 成组判题/运行结果（runGroup 与 exeInput 的 data 同构） */
export interface RunData {
    exception: string;
    runErrCount: number;
    runRightCount: number;
    /** true → 需再调 exeInput 喂入 */
    needInput: boolean;
    /** 未通过的测试数据组 */
    errorOrder: Record<string, unknown>;
    backtrace: unknown[];
    variables: unknown[];
    watchPoint: Record<string, unknown>;
    /** 程序输出（判题 tag 在这里找，见 analysis/08-data-formats.md） */
    output: string;
    lineNum: string;
    end: boolean;
    passed: boolean;
    order: number;
}

export function isApiSuccess(code: number): boolean {
    return (SUCCESS_CODES as readonly number[]).includes(code) ||
        (DEPRECATED_SUCCESS_CODES as readonly number[]).includes(code);
}
