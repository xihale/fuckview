import { header } from "./config.ts";
import { type RunGroupResponse } from "../types/runGroup";

export async function runGroup(
    eID: string | number,
    stuCode: string,
    questionFullName: string,
    language: number = 1,
    kind: number = 4,
): Promise<RunGroupResponse> {
    let cleanStuCode = stuCode.trim();

    stuCode = Buffer.from(cleanStuCode).toString("base64");

    // Create form data boundary
    const boundary =
        "----WebKitFormBoundary" + Math.random().toString(16).substring(2, 12);
    const formDataParts = [
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="questionFullName"',
        "",
        questionFullName,
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="eID"',
        "",
        eID.toString(),
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="isTeacher"',
        "",
        "false",
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="kind"',
        "",
        kind.toString(),
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="language"',
        "",
        language.toString(),
        `------WebKitFormBoundary${boundary}`,
        'Content-Disposition: form-data; name="stuCode"',
        "",
        stuCode,
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
        "https://anyview.gdut.edu.cn/api/gdb-service/code/runGroup",
        {
            method: "POST",
            headers: formHeaders,
            body: formData,
        },
    );

    const data: RunGroupResponse = (await res.json()) as RunGroupResponse;
    return data;
}
