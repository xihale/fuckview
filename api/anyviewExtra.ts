// AnyView 刷时长 + 保存代码 + 题目内容接口
// 从 AnyView 前端 bundle (student.js) 逆向得到:
// - POST /api/gdb-service/exercise/saveStudentCode  保存学生代码(JSON: {eID, studentCode: base64})
//   前端"保存代码"时调用, 是服务端记录做题行为的关键信号
// - GET  /api/scheme-service/scheme/list/student/{eID}  拿题目内容 (data.doc)

import { config, header } from "./config";
import type { GetSchemeListResponse } from "../types/scheme";

// 保存代码到平台 (刷时长用: 模拟学生"保存"行为)
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
