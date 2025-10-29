import type { CompileResponse } from "../types/compile.ts";
import { header } from "./config.ts";

export async function compile(
    eID: string | number,
    stuCode: string,
    questionFullName: string,
): Promise<void> {
    let cleanStuCode = stuCode;
    cleanStuCode = cleanStuCode.trim();

    try {
        stuCode = btoa(cleanStuCode);
    } catch (error) {
        // 方法2: 使用 TextEncoder
        try {
            const encoder = new TextEncoder();
            const encoded = encoder.encode(cleanStuCode);
            stuCode = btoa(String.fromCharCode(...encoded));
        } catch (error2) {
            throw new Error(`无法编码文件内容: ${error}`);
        }
    }

    // Create form data boundary
    const boundary =
        "----WebKitFormBoundary" + Math.random().toString(16).substring(2, 12);
    const formDataParts = [
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="questionRes.questionFullName"',
        "",
        questionFullName,
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="eID"',
        "",
        eID.toString(),
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="stuCode"',
        "",
        stuCode,
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="isTeacher"',
        "",
        "false",
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="isDebug"',
        "",
        "false",
        `------WebKitFormBoundary${boundary}--`,
        "",
    ];

    const formData = formDataParts.join("\r\n");

    // Create proper headers
    const formHeaders = {
        ...header,
        "Content-Type": `multipart/form-data; boundary=----WebKitFormBoundary${boundary}`,
        "Content-Length": formData.length.toString(),
    };

    const res = await fetch(
        "https://anyview.gdut.edu.cn/api/gdb-service/code/compile",
        {
            method: "POST",
            headers: formHeaders,
            body: formData,
        },
    );

    const data = (await res.json()) as CompileResponse;
    if (data.code != 200 || !data.data.result.includes("编译成功")) {
        console.log(
            `编译失败 - 题目: ${questionFullName}, 结果: ${data.data.result}`,
        );
        throw new Error(data.data.result);
    }
}
