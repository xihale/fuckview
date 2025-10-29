// Run Group API Response
export interface RunGroupResponse {
    code: number;
    message: string;
    data: {
        exception: string;
        runErrCount: number;
        variables: any[];
        runRightCount: number;
        needInput: boolean;
        errorOrder: Record<string, any>;
        backtrace: any[];
        output: string;
        watchPoint: Record<string, any>;
        lineNum: string;
        end: boolean;
        passed: boolean;
        order: number;
    };
}
