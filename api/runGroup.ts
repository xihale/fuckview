import { header } from "./config.ts";
import { type RunGroupResponse } from "../types/runGroup";
import { exeInput } from "./executeInput.ts";

export async function runGroup(
    eID: string | number,
    stuCode: string,
    questionFullName: string,
    language: number = 1,
    kind: number = 4,
): Promise<void> {
    // 安全的编码处理：移除无效字符并标准化
    let cleanStuCode = stuCode;
    cleanStuCode = cleanStuCode
        .replace(/[^\x20-\x7E\r\n\t]/g, "") // 只保留ASCII可打印字符、换行符、制表符
        .replace(/\r\n/g, "\n") // 统一换行符
        .replace(/\r/g, "\n") // 统一换行符
        .trim();

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

    if (data.data.needInput) {
        const map_delimiter = {
            空格: " ",
            逗号: ",",
            ",": ",",
            回车: "\n",
        };

        const msg = data.data.output;

        let inputs = [];
        let delimiter = " ";
        let match;

        const regex = /：(-?\d+\.\d+|-?\d+|[a-zA-Z]+)/g;
        while ((match = regex.exec(msg)) !== null) {
            inputs.push(match[1]);
        }

        if (inputs.length === 0) {
            const bracketRegex = /(.)个(整数|字符|浮点数|正整数)/g;
            if ((match = bracketRegex.exec(msg)) !== null) {
                const count = match[1]!; // x 可能是数字或汉字数字
                const type = match[2]!; // xx 可能是字符、浮点数、整数

                // 处理数字或汉字数字的计数
                let numericCount;
                if (/\d+/.test(count)) {
                    numericCount = parseInt(count);
                } else {
                    // 汉字数字转数字
                    const chineseToNum: { [key: string]: number } = {
                        一: 1,
                        二: 2,
                        三: 3,
                        四: 4,
                        五: 5,
                        六: 6,
                        七: 7,
                        八: 8,
                        九: 9,
                        十: 10,
                    };
                    numericCount = chineseToNum[count] || 1;
                }

                switch (type) {
                    case "整数":
                    case "正整数":
                        inputs = Array(numericCount).fill(0);
                        break;
                    case "字符":
                        inputs = Array(numericCount).fill("a");
                        break;
                    case "浮点数":
                        inputs = Array(numericCount).fill(1.5);
                        break;
                }
            }
        }

        for (const [key, value] of Object.entries(map_delimiter)) {
            if (msg.includes(key)) {
                delimiter = value;
                break;
            }
        }

        const input = inputs.join(delimiter);
        const res = await exeInput(eID, input);

        const output = res.data.output;

        if (!res.data.passed) {
            throw output;
        }
    } else if (!data.data.passed) {
        throw [data.message, data.data.output];
    }
}
