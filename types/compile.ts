// Compile API Response
export interface CompileResponse {
    code: number;
    message: string;
    data: {
        result: string;
        cmpRightCount: number;
        cmpErrorCount: number;
    };
}
