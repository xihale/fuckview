// AnyView 保存代码 + 题目内容接口
// 从 AnyView 前端 bundle (student.js) 逆向得到:
// - POST /api/gdb-service/exercise/saveStudentCode  保存学生代码(JSON: {eID, studentCode: base64})
//   前端"保存代码"时调用。⚠️ 不影响 accumTime(2026-09-07 实测, 见 analysis/10),
//   且 compile/runGroup 也会顺带覆盖 stuCode 存档——做实验前后须快照/恢复
// - GET  /api/scheme-service/scheme/list/student/{eID}  拿题目内容 (data.doc)

import { config, header } from "./config";
import type { GetSchemeListResponse } from "../types/scheme";

// 保存代码到平台 (同步 stuCode 存档用, 比如恢复实验前的代码快照)
export async function saveStudentCode(
    eID: string | number,
    stuCode: string,
): Promise<number> {
    const body = {
        eID: eID.toString(),
        studentCode: Buffer.from(stuCode.trim()).toString("base64"),
    };
    const res = await fetch(
        "https://anyview.gdut.edu.cn/api/gdb-service/exercise/saveStudentCode",
        {
            method: "POST",
            headers: {
                ...header,
                Token: config.token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        },
    );
    return res.status;
}

// 获取题目内容 (题目描述)
export async function getQuestionDoc(eID: string | number): Promise<string> {
    const url = `https://anyview.gdut.edu.cn/api/scheme-service/scheme/list/student/${eID}`;
    const res = (await (
        await fetch(url, { method: "GET", headers: header })
    ).json()) as GetSchemeListResponse;
    if (res.code != 200) {
        throw new Error(`获取题目 ${eID} 内容失败: ${res.message}`);
    }
    return res.data.doc;
}
