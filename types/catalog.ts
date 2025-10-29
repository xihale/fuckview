// Catalog Item for getCatalogList API
export interface CatalogItem {
    difficulty: number;
    eid: number;
    pass: boolean;
    pname: string;
    kind: number;
    pmemo: string;
    maximumSimilarity: number;
    comment: string | null;
    accumTime: number;
    questionType: number;
    chapName: string;
    commentStatus: string | null;
}

// Get Catalog List API Response
export interface GetCatalogListResponse {
    code: number;
    message: string;
    data: CatalogItem[];
}
