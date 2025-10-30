import type { CompileResponse } from "../types/compile.ts";
import { header } from "./config.ts";

export async function compile(
    eID: string | number,
    stuCode: string,
    questionFullName: string,
): Promise<CompileResponse> {
    let cleanStuCode = stuCode.trim();

    stuCode = Buffer.from(cleanStuCode).toString("base64");

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
    return data;
}

export function isCompileSuccess(compileResult: CompileResponse): boolean {
    return compileResult.code === 200 && compileResult.data.result.includes("编译成功");
}
