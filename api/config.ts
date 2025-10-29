export const config = {
    token: "",
    cookie: "",
    schemeId: 435, // 学的课程都一样，题目列表还能不一样？
    classId: 348,
};

export const header = {
    accept: "application/json, text/plain, */*",
    "User-Agent": "Teru-Hack/FuckVersion.0",
    Token: config.token,
    Cookie: config.cookie,
};
