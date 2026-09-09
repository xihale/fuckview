// fix: 对 failed 的答案带错误信息重新生成(走 batch, 最多 maxAttempts 次)
// 用法: bun index.ts fix [--model xxx] [--max-attempts 3]

import { getCatalogList } from "../api/getCatalogList";
import { getQuestionDoc } from "../api/anyviewExtra";
import {
    createBatch,
    DEFAULT_MODEL,
    downloadBatchResults,
    extractOutputText,
    retrieveBatch,
    uploadBatchFile,
    waitBatch,
} from "../api/siliconflow";
import {
    chatCompletion,
    DEFAULT_MODEL as NORMAL_DEFAULT_MODEL,
    extractChatText,
} from "../api/normal";
import type { BatchInputLine } from "../types/siliconflow";
import type { CatalogItem } from "../types/catalog";
import {
    buildFixPrompt,
    extractCode,
    SYSTEM_PROMPT,
} from "./prompt";
import {
    ensureGenDirs,
    loadAllAnswers,
    newAnswerRecord,
    saveAnswer,
    saveBatchRecord,
} from "./store";
import type { AnswerRecord } from "./store";

export interface FixOptions {
    model?: string;
    mode?: "batch" | "normal";
    maxAttempts?: number;
    limit?: number;
    pnames?: string[];
    dry?: boolean;
}

export async function fixAnswers(opts: FixOptions = {}): Promise<void> {
    ensureGenDirs();
    const mode = opts.mode ?? "batch";
    const model = opts.model ?? (mode === "normal" ? NORMAL_DEFAULT_MODEL : DEFAULT_MODEL);
    const maxAttempts = opts.maxAttempts ?? 3;

    // 找出需要修复的: failed 且 attempt < maxAttempts
    let candidates: AnswerRecord[];
    if (opts.pnames?.length) {
        const all = await loadAllAnswers();
        candidates = all.filter(
            (r) => opts.pnames!.includes(r.pname) && r.attempt < maxAttempts,
        );
    } else {
        candidates = (await loadAllAnswers()).filter(
            (r) => r.status === "failed" && r.attempt < maxAttempts,
        );
    }
    if (opts.limit) candidates = candidates.slice(0, opts.limit);

    if (candidates.length === 0) {
        console.log(
            `没有需要修复的答案 (failed 且 attempt<${maxAttempts} 的记录为空)`,
        );
        return;
    }
    console.log(
        `准备修复 ${candidates.length} 道题 (attempt ${candidates.map((c) => `${c.pname}#${c.attempt}`).join(", ")})`,
    );

    // 拉题目内容
    const catalog = await getCatalogList();
    const lines: BatchInputLine[] = [];
    const valid: AnswerRecord[] = [];
    const docs = new Map<string, { problem: CatalogItem; doc: string }>();

    for (const rec of candidates) {
        const p = catalog.data.find((x) => x.pname === rec.pname);
        if (!p) {
            console.log(`⚠ ${rec.pname}: catalog 中不存在, 跳过`);
            continue;
        }
        let doc: string;
        try {
            doc = await getQuestionDoc(p.eid);
        } catch (err) {
            console.log(`⚠ ${rec.pname}: 获取题目内容失败 ${err}`);
            continue;
        }
        docs.set(rec.pname, { problem: p, doc });
        const lastError = rec.lastError ?? "未知错误";
        lines.push({
            custom_id: rec.pname,
            method: "POST",
            url: "/v1/chat/completions",
            body: {
                model,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: buildFixPrompt(
                            p,
                            doc,
                            rec.code,
                            lastError,
                            rec.attempt,
                        ),
                    },
                ],
                temperature: 0.3,
                max_tokens: 4096,
            },
        });
        valid.push(rec);
    }

    if (lines.length === 0) {
        console.log("没有可修复的题目");
        return;
    }
    if (opts.dry) {
        console.log(
            mode === "normal"
                ? `[DRY] 将发送 ${lines.length} 条普通 API 修复请求`
                : `[DRY] 将上传 ${lines.length} 条修复请求`,
        );
        return;
    }

    if (mode === "normal") {
        await fixWithNormalApi(valid, docs, model);
        return;
    }

    console.log(`上传 ${lines.length} 条修复请求...`);
    const fileId = await uploadBatchFile(lines);
    const batch = await createBatch(fileId, {
        model,
        description: `fuckview fix ${new Date().toISOString()}`,
    });
    console.log(`batch 已创建: ${batch.id}`);
    await saveBatchRecord({
        id: batch.id,
        inputFileId: fileId,
        model,
        pnames: valid.map((v) => v.pname),
        status: batch.status,
        createdAt: new Date().toISOString(),
    });

    const final = await waitBatch(batch.id, {
        pollIntervalSec: 30,
        onProgress: (b) => {
            const rc = b.request_counts;
            process.stdout.write(
                `\r[${b.status}] completed=${rc.completed} failed=${rc.failed}/${rc.total}   `,
            );
        },
    });
    console.log(`\nbatch 结束: ${final.status}`);
    if (final.status !== "completed") {
        throw new Error(`batch 未成功完成: ${final.status}`);
    }

    // 下载结果
    const { outputs } = await downloadResults(final.id);
    let ok = 0;
    for (const line of outputs) {
        const text = extractOutputText(line);
        const rec = valid.find((v) => v.pname === line.custom_id);
        if (!text || !rec) continue;
        const code = extractCode(text);
        if (!code) {
            console.log(`⚠ ${line.custom_id}: 修复回答中未找到代码`);
            continue;
        }
        const p: CatalogItem | undefined = (
            await getCatalogList()
        ).data.find((x) => x.pname === line.custom_id);
        const newRec = newAnswerRecord(
            p ?? {
                pname: rec.pname,
                chapName: rec.chapName,
                eid: rec.eid,
                questionType: rec.questionType,
            } as CatalogItem,
            code,
            rec.attempt + 1,
            model,
        );
        // 带上次的错误信息, 方便排查
        newRec.lastError = rec.lastError;
        await saveAnswer(newRec);
        ok++;
        console.log(`  ✓ ${rec.pname} -> attempt ${rec.attempt + 1}`);
    }
    console.log(`修复完成: ${ok}/${outputs.length} 条已更新, 用 submit 重新提交`);
}

async function fixWithNormalApi(
    records: AnswerRecord[],
    docs: Map<string, { problem: CatalogItem; doc: string }>,
    model: string,
): Promise<void> {
    let ok = 0;
    for (const [index, rec] of records.entries()) {
        const job = docs.get(rec.pname);
        if (!job) continue;
        process.stdout.write(`[${index + 1}/${records.length}] ${rec.pname} ... `);
        try {
            const response = await chatCompletion(
                [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: buildFixPrompt(
                            job.problem,
                            job.doc,
                            rec.code,
                            rec.lastError ?? "未知错误",
                            rec.attempt,
                        ),
                    },
                ],
                { model, temperature: 0.3, maxTokens: 4096 },
            );
            const text = extractChatText(response);
            const code = text ? extractCode(text) : null;
            if (!code) {
                console.log("回答中未找到代码");
                continue;
            }
            const next = newAnswerRecord(
                job.problem,
                code,
                rec.attempt + 1,
                model,
            );
            next.lastError = rec.lastError;
            await saveAnswer(next);
            ok++;
            console.log(`✓ attempt ${next.attempt}`);
        } catch (error) {
            console.log(`✗ ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    console.log(`普通 API 修复完成: ${ok}/${records.length} 条已更新, 用 submit 重新提交`);
}

async function downloadResults(batchId: string) {
    return downloadBatchResults(await retrieveBatch(batchId));
}
