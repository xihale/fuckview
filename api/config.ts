export const config = {
    token: process.env["ANYVIEW_TOKEN"] ?? "",
    cookie: process.env["ANYVIEW_COOKIE"] ?? "",
    schemeId: Number(process.env["ANYVIEW_SCHEME_ID"] ?? 435),
    classId: Number(process.env["ANYVIEW_CLASS_ID"] ?? 348),
};

export function setCourseSelection(selection: {
    schemeId: number;
    classId: number;
}): void {
    config.schemeId = selection.schemeId;
    config.classId = selection.classId;
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
