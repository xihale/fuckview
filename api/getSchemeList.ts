import { header } from "./config.ts";

export async function getSchemeList(eID: number | string): Promise<Response> {
    const url = `https://anyview.gdut.edu.cn/api/scheme-service/scheme/list/student/${eID}`;

    return fetch(url, {
        method: "GET",
        headers: header,
    });
}
