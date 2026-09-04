// write: 批量获取未通过题目 -> 构建 prompt -> 硅基流动 batch 生成答案 -> 落盘
// 用法: bun index.ts write [--model xxx] [--limit N] [--dry]

import { getCatalogList } from "../api/getCatalogList";
import { getQuestionDoc } from "../api/anyviewExtra";
import {
    DEFAULT_MODEL,
    downloadBatchResults,
    createBatch,
    uploadBatchFile,
    waitBatch,
    retrieveBatch,
    extractOutputText,
} from "../api/siliconflow";
import type { BatchInputLine } from "../types/siliconflow";
import type { CatalogItem } from "../types/catalog";
import {
    buildQuestionPrompt,
    SYSTEM_PROMPT,
    extractCode,
} from "./prompt";
import {
    ensureGenDirs,
    loadAnswer,
    newAnswerRecord,
    saveAnswer,
    saveBatchRecord,
} from "./store";

export interface WriteOptions {
    model?: string;
    limit?: number;
    dry?: boolean;
    maxTokens?: number;
}

// 收集需要生成的题目: 未通过 && (无答案记录 或 记录为 failed 且 attempt < maxAttempts)
export async function collectProblems(
    opts: { includeFailed?: boolean; maxAttempts?: number; limit?: number } = {},
): Promise<CatalogItem[]> {
    const catalogResponse = await getCatalogList();
    const problems = catalogResponse.data.filter((p) => !p.pass);
    const result: CatalogItem[] = [];
    const maxAttempts = opts.maxAttempts ?? 3;

    for (const p of problems) {
        if (opts.limit && result.length >= opts.limit) break;
        const rec = await loadAnswer(p.pname);
        if (rec) {
            if (rec.status === "passed") continue;
            // failed/pending 已有代码, 只有 includeFailed(=fix 流程)时重新生成
            if (!opts.includeFailed) continue;
            if (rec.attempt >= maxAttempts) continue;
        }
        result.push(p);
    }
    return result;
}

// write 主流程
export async function writeAnswers(opts: WriteOptions = {}): Promise<void> {
    ensureGenDirs();
    const model = opts.model ?? DEFAULT_MODEL;
    const problems = await collectProblems({ limit: opts.limit });

    if (problems.length === 0) {
        console.log("没有需要生成的题目（未通过的题目都已有 pending/passed 答案）");
        return;
    }
    console.log(
        `准备为 ${problems.length} 道题生成答案 (model=${model}${opts.dry ? ", DRY RUN" : ""})`,
    );

    // 并发拉取题目内容
    const docs = new Map<string, string>();
    const CONCURRENCY = 8;
    let fetched = 0;
    for (let i = 0; i < problems.length; i += CONCURRENCY) {
        const chunk = problems.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
            chunk.map(async (p) => {
                const doc = await getQuestionDoc(p.eid);
                docs.set(p.pname, doc);
                return p.pname;
            }),
        );
        fetched += results.filter((r) => r.status === "fulfilled").length;
        process.stdout.write(
            `\r拉取题目内容 ${fetched}/${problems.length}`,
        );
    }
    console.log();

    // 构建 batch 输入
    const lines: BatchInputLine[] = [];
    const valid: CatalogItem[] = [];
    for (const p of problems) {
        const doc = docs.get(p.pname);
        if (!doc) {
            console.log(`⚠ 跳过 ${p.pname}: 无法获取题目内容`);
            continue;
        }
        valid.push(p);
        lines.push({
            custom_id: p.pname,
            method: "POST",
            url: "/v1/chat/completions",
            body: {
                model,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: buildQuestionPrompt(p, doc) },
                ],
                temperature: 0.2,
                max_tokens: opts.maxTokens ?? 4096,
            },
        });
    }

    if (opts.dry) {
        console.log(`[DRY] 将上传 ${lines.length} 条请求，示例 custom_id: ${lines.slice(0, 5).map((l) => l.custom_id).join(", ")}`);
        return;
    }

    // 上传 + 创建 batch
    console.log(`上传 ${lines.length} 条请求到硅基流动...`);
    const fileId = await uploadBatchFile(lines);
    const batch = await createBatch(fileId, {
        model,
        description: `fuckview write ${new Date().toISOString()}`,
    });
    console.log(`batch 已创建: ${batch.id} (status=${batch.status})`);

    await saveBatchRecord({
        id: batch.id,
        inputFileId: fileId,
        model,
        pnames: valid.map((p) => p.pname),
        status: batch.status,
        createdAt: new Date().toISOString(),
    });

    // 轮询
    console.log("轮询 batch 状态 (Ctrl+C 可中断, 结果仍在云端, 可用 recover 恢复)...");
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

    await saveBatchRecord({
        id: final.id,
        inputFileId: fileId,
        model,
        pnames: valid.map((p) => p.pname),
        status: final.status,
        createdAt: new Date(final.created_at * 1000).toISOString(),
        finishedAt: final.completed_at
            ? new Date(final.completed_at * 1000).toISOString()
            : undefined,
    });

    if (final.status !== "completed") {
        throw new Error(`batch 未成功完成: ${final.status}`);
    }

    await ingestBatchResults(final.id);
}

// 从云端下载 batch 结果并写入本地答案库 (write 与 recover 共用)
export async function ingestBatchResults(batchId: string): Promise<void> {
    const batch = await retrieveBatch(batchId);
    const { outputs, errors } = await downloadBatchResults(batch);
    console.log(`下载结果: ${outputs.length} 成功, ${errors.length} 失败`);

    let ok = 0;
    let noCode = 0;
    const metaList = await getCatalogList();
    for (const line of outputs) {
        const text = extractOutputText(line);
        const problemMeta = metaList.data.find((x) => x.pname === line.custom_id);
        if (!text) {
            noCode++;
            console.log(`⚠ ${line.custom_id}: 回答为空`);
            continue;
        }
        const code = extractCode(text);
        if (!code) {
            noCode++;
            console.log(`⚠ ${line.custom_id}: 回答中未找到代码`);
            continue;
        }
        const rec = newAnswerRecord(
            problemMeta ?? {
                pname: line.custom_id,
                chapName: "",
                eid: 0,
                questionType: 1,
            } as CatalogItem,
            code,
            1,
            batch.model,
        );
        await saveAnswer(rec);
        ok++;
    }
    console.log(`✓ 写入 ${ok} 条答案${noCode ? `, ${noCode} 条异常` : ""}`);
}
