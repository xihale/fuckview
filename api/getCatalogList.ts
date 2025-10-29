import type { GetCatalogListResponse } from "../types/catalog.ts";
import { header, config } from "./config.ts";

export async function getCatalogList(): Promise<GetCatalogListResponse> {
    const url = new URL(
        "https://anyview.gdut.edu.cn/api/scheme-service/catalog/list",
    );
    url.searchParams.append("schemeId", config.schemeId.toString());
    url.searchParams.append("classId", config.classId.toString());

    const res = (await (
        await fetch(url.toString(), {
            method: "GET",
            headers: header,
        })
    ).json()) as GetCatalogListResponse;

    if (res.code != 200) {
        throw new Error(`Failed to get catalog list: ${res.message}`);
    }

    return res;
}
