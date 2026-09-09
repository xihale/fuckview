import { header } from "./config";
import type { CourseListResponse, CourseOption } from "../types/course";

const COURSE_LIST_URL =
    "https://anyview.gdut.edu.cn/api/exercise-service/course/stu/list";

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function numberField(obj: Record<string, unknown>, ...names: string[]): number | undefined {
    for (const name of names) {
        const value = obj[name];
        const number = typeof value === "number" ? value : Number(value);
        if (value !== undefined && value !== null && Number.isFinite(number)) {
            return number;
        }
    }
    return undefined;
}

function stringField(obj: Record<string, unknown>, ...names: string[]): string | undefined {
    for (const name of names) {
        const value = obj[name];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return undefined;
}

function findRows(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    const obj = asRecord(data);
    if (!obj) return [];
    for (const key of [
        "rows",
        "records",
        "list",
        "courses",
        "courseList",
        "schemes",
        "schemeList",
        "content",
        "items",
    ]) {
        if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    if (obj["data"] && obj["data"] !== data) return findRows(obj["data"]);
    return [];
}

export function normalizeCourseList(payload: CourseListResponse): CourseOption[] {
    return findRows(payload.data).flatMap((value) => {
        const row = asRecord(value);
        if (!row) return [];
        const nestedCourse = asRecord(row["course"]);
        const nestedClass = asRecord(row["class"]);
        const nestedScheme = asRecord(row["scheme"]);
        const merged = { ...nestedCourse, ...row };
        const schemeId = numberField(merged, "schemeId", "schemeID", "scheme_id")
            ?? numberField(nestedScheme ?? {}, "id", "schemeId")
            // 某些 AnyView 版本直接把作业表 ID 放在行的 id 字段。
            ?? numberField(merged, "id");
        const classId = numberField(
            merged,
            "classId",
            "classID",
            "class_id",
            "clazzId",
            "stuClassId",
        )
            ?? numberField(nestedClass ?? {}, "id", "classId");
        if (schemeId === undefined || classId === undefined) return [];
        return [{
            courseId: numberField(merged, "courseId", "courseID", "course_id", "id"),
            courseName: stringField(
                merged,
                "courseName",
                "course_name",
                "cname",
                "name",
                "title",
            ) ?? `课程 ${schemeId}`,
            schemeId,
            classId,
            termName: stringField(merged, "termName", "term", "semester"),
            raw: value,
        }];
    });
}

export async function getCourseList(params?: Record<string, string | number>): Promise<CourseOption[]> {
    const url = new URL(COURSE_LIST_URL);
    for (const [key, value] of Object.entries(params ?? {})) {
        url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, { method: "GET", headers: header });
    let payload: CourseListResponse;
    try {
        payload = (await response.json()) as CourseListResponse;
    } catch {
        throw new Error(`获取课程列表失败 (HTTP ${response.status})`);
    }
    if (!response.ok || Number(payload.code) !== 200) {
        throw new Error(`获取课程列表失败 (HTTP ${response.status}): ${payload.message ?? "未知错误"}`);
    }
    return normalizeCourseList(payload);
}
