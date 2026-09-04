// Prompt 构建: 让 AI 生成符合 AnyView 规范的 C 代码

import type { CatalogItem } from "../types/catalog";

export const SYSTEM_PROMPT = `你是一个精通 C 语言的编程助手，为 GDUT AnyView 平台的编程题写答案。

严格要求：
1. 代码第一行必须是: #include "allinclude.h" //DO NOT edit this line
   （平台会自动提供该头文件，不要 include 任何标准库头文件）
2. 只输出代码本身，用 \`\`\`c 代码块包裹，不要任何解释文字。
3. 函数签名、变量命名、输入输出格式必须严格遵循题目要求。
4. 如果题目要求实现特定函数（而非 main），只实现该函数。
5. 不要使用题目未说明的额外提示输出。`;

// 从题目 HTML 中提取纯文本
export function htmlToText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function buildQuestionPrompt(
    problem: CatalogItem,
    doc: string,
): string {
    return `题目编号: ${problem.pname}（第${problem.chapName}章）
题目内容:
${htmlToText(doc)}

请给出这道题的完整 C 代码答案。`;
}

export function buildFixPrompt(
    problem: CatalogItem,
    doc: string,
    previousCode: string,
    errorInfo: string,
    attempt: number,
): string {
    return `题目编号: ${problem.pname}（第${problem.chapName}章），第 ${attempt} 次尝试失败。

题目内容:
${htmlToText(doc)}

上一次的代码:
\`\`\`c
${previousCode}
\`\`\`

运行/编译失败信息:
${errorInfo}

请分析失败原因，给出修正后的完整 C 代码。仍然要遵守全部格式要求。`;
}

// 从 AI 回答中提取 ```c 代码块
export function extractCode(reply: string): string | null {
    // 优先匹配 ```c ... ```
    const cBlock = reply.match(/```(?:c|cpp)?\s*\n([\s\S]*?)```/);
    if (cBlock?.[1]) return cBlock[1].trim();
    // 兜底: 整段回复看起来就是代码
    if (reply.includes("#include")) return reply.trim();
    return null;
}
