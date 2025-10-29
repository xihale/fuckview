// Scheme Data for getSchemeList API
export interface SchemeData {
    questionFullName: string;
    questionId: number;
    kind: number;
    doc: string;
    language: number;
    completes: any[];
    stuCode: string;
}

// Get Scheme List API Response
export interface GetSchemeListResponse {
    code: number;
    message: string;
    data: SchemeData;
}
