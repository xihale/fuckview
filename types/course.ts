export interface CourseOption {
    /** AnyView 课程 ID（部分版本接口不返回） */
    courseId?: number;
    courseName: string;
    schemeId: number;
    classId: number;
    termName?: string;
    raw?: unknown;
}

export interface CourseListResponse {
    code: number;
    message: string;
    data: unknown;
}
