// schemeId/classId 会被拼进请求 URL 路径与本地文件名, 统一在赋值边界收口:
// 只放行正整数, 环境变量/CLI 参数/接口数据里的其它值一律拒之门外
function coerceCourseId(value: unknown, name: string): number {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0 || n > 1e9) {
        throw new Error(`课程 ${name} 非法: ${JSON.stringify(String(value))}, 需要正整数`);
    }
    return n;
}

export const config = {
    token: process.env["ANYVIEW_TOKEN"] ?? "",
    cookie: process.env["ANYVIEW_COOKIE"] ?? "",
    schemeId: coerceCourseId(process.env["ANYVIEW_SCHEME_ID"] ?? 435, "schemeId"),
    classId: coerceCourseId(process.env["ANYVIEW_CLASS_ID"] ?? 348, "classId"),
};

export function setCourseSelection(selection: {
    schemeId: number;
    classId: number;
}): void {
    config.schemeId = coerceCourseId(selection.schemeId, "schemeId");
    config.classId = coerceCourseId(selection.classId, "classId");
}

// 鉴权头: getter 形式保证运行期刷新 config.token/cookie 后立即生效
// (调用方 ...header 展开时才求值)
export const header = {
    accept: "application/json, text/plain, */*",
    "User-Agent": "Teru-Hack/FuckVersion.0",
    get Token() {
        return config.token;
    },
    get Cookie() {
        return config.cookie;
    },
};
