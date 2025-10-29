import type { ExecuteInputResponse } from "../types/executeInput.ts";
import { header } from "./config.ts";

export async function exeInput(
    eID: string | number,
    inputStr: string,
    language: number = 1,
    kind: number = 4,
    isTeacher: boolean = false,
): Promise<ExecuteInputResponse> {
    // Create form data boundary
    const boundary =
        "----WebKitFormBoundary" + Math.random().toString(16).substring(2, 12);
    const formDataParts = [
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="inputStr"',
        "",
        inputStr,
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="isTeacher"',
        "",
        isTeacher.toString(),
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="language"',
        "",
        language.toString(),
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="kind"',
        "",
        kind.toString(),
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="eID"',
        "",
        eID.toString(),
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
        "https://anyview.gdut.edu.cn/api/gdb-service/code/exeInput",
        {
            method: "POST",
            headers: formHeaders,
            body: formData,
        },
    );

    const data = (await res.json()) as ExecuteInputResponse;

    if (data.code !== 200) {
        console.log(`代码执行输入失败 - eID: ${eID}, 结果: ${data.message}`);
        throw new Error(data.message || "代码执行输入失败");
    }

    return data;
}
