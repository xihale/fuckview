// submit: 读取本地答案 -> 刷时长 -> 编译 -> 运行 -> (需要输入则处理) -> 通过则放入 data/
// 用法: bun index.ts submit [--min 8] [--max 18] [--brush 8-18] [--limit N] [--pname CP03EX010]

import { join } from "path";
import { compile, isCompileSuccess } from "../api/compile";
import { runGroup } from "../api/runGroup";
import { brushTime } from "./brushTime";
import { handleInput } from "./handleInput";
import {
    appendSubmitLog,
    ensureGenDirs,
    loadAllAnswers,
    loadAnswer,
    saveAnswer,
} from "./store";
import type { AnswerRecord } from "./store";
import { getCatalogList } from "../api/getCatalogList";

export interface SubmitOptions {
    // 刷时长目标分钟: 数字或区间, 默认 [8, 18]
    brushMinutes?: number | [number, number];
    limit?: number;
    pnames?: string[];
    // 跳过刷时长(调试用)
    noBrush?: boolean;
}

// 通过后的答案写入 data/ (临时本地目录, 不动 submodule)
const DATA_OUT_DIR = join("data");

function answerFileName(pname: string): string {
    return `${pname}.c`;
}

// 单题提交流程
export async function submitOne(
    rec: AnswerRecord,
    opts: SubmitOptions,
): Promise<boolean> {
    const questionFullName = `第${rec.chapName}章-${rec.pname}`;
    console.log(`\n▼ ${rec.pname} (attempt ${rec.attempt})`);

    // 1. 刷时长
    if (!opts.noBrush) {
        await brushTime(rec.eid, rec.code, {
            minutes: opts.brushMinutes ?? [8, 18],
            questionFullName,
        });
    }

    // 2. 编译
    let compileResult;
    try {
        compileResult = await compile(rec.eid, rec.code, questionFullName);
    } catch (err) {
        await markFailed(rec, `编译接口异常: ${err}`);
        return false;
    }
    if (!isCompileSuccess(compileResult)) {
        const err = `编译失败: ${compileResult.data.result}`;
        console.log(`  ✗ ${err}`);
        await markFailed(rec, err);
        return false;
    }
    console.log("  ✓ 编译成功");

    // 3. 运行
    let runResult;
    try {
        runResult = await runGroup(rec.eid, rec.code, questionFullName);
    } catch (err) {
        await markFailed(rec, `运行接口异常: ${err}`);
        return false;
    }

    if (runResult.data.passed) {
        await markPassed(rec);
        return true;
    }

    // 4. 需要输入
    if (runResult.data.needInput) {
        console.log("  ↪ 题目需要输入");
        try {
            if (await handleInput(rec.eid, runResult.data.output)) {
                await markPassed(rec);
                return true;
            }
        } catch (output) {
            const err = `输入后运行失败: ${output}`;
            console.log(`  ✗ ${err}`);
            await markFailed(rec, err);
            return false;
        }
    }

    // 5. 运行失败, 收集错误信息
    const errInfo = summarizeRunError(runResult.data);
    console.log(`  ✗ 运行失败: ${errInfo.split("\n")[0]}`);
    await markFailed(rec, errInfo);
    return false;
}

function summarizeRunError(data: {
    output: string;
    exception: string;
    runErrCount: number;
    runRightCount: number;
}): string {
    const parts: string[] = [];
    if (data.exception) parts.push(`异常: ${data.exception}`);
    parts.push(
        `测试点 通过${data.runRightCount}/失败${data.runErrCount}`,
    );
    if (data.output) parts.push(`输出:\n${data.output.slice(0, 2000)}`);
    return parts.join("\n");
}

async function markPassed(rec: AnswerRecord): Promise<void> {
    rec.status = "passed";
    rec.passedTime = new Date().toISOString();
    await saveAnswer(rec);

    // 写入 data/{chapter}/{pname}.c
    const dir = join(DATA_OUT_DIR, `Chapter${rec.chapName}`);
    const fs = require("fs");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await Bun.write(join(dir, answerFileName(rec.pname)), rec.code);

    console.log(`  ✓ 通过! 答案已放入 data/Chapter${rec.chapName}/${answerFileName(rec.pname)}`);
    await appendSubmitLog(`PASS ${rec.pname} attempt=${rec.attempt}`);
}

async function markFailed(rec: AnswerRecord, err: string): Promise<void> {
    rec.status = "failed";
    rec.lastError = err;
    await saveAnswer(rec);
    await appendSubmitLog(`FAIL ${rec.pname} attempt=${rec.attempt} err=${err.split("\n")[0]}`);
}

// submit 主流程
export async function submitAnswers(opts: SubmitOptions = {}): Promise<void> {
    ensureGenDirs();

    let records: AnswerRecord[];
    if (opts.pnames?.length) {
        records = [];
        for (const pn of opts.pnames) {
            const rec = await loadAnswer(pn);
            if (!rec) {
                console.log(`⚠ ${pn}: 本地没有答案记录, 跳过`);
                continue;
            }
            records.push(rec);
        }
    } else {
        records = (await loadAllAnswers()).filter(
            (r) => r.status === "pending" || r.status === "failed",
        );
        // 按 eid 排序, 从头按章节顺序提交
        records.sort((a, b) => a.eid - b.eid);
    }
    if (opts.limit) records = records.slice(0, opts.limit);

    if (records.length === 0) {
        console.log("没有待提交的答案 (gen/answers 下无 pending/failed 记录)");
        return;
    }
    console.log(`待提交 ${records.length} 题`);

    // 校验 token 可用: 先拉一次 catalog
    try {
        await getCatalogList();
    } catch (err) {
        throw new Error(`AnyView token 可能失效（获取题目列表失败）: ${err}`);
    }

    let passed = 0;
    let failed = 0;
    for (const [i, rec] of records.entries()) {
        console.log(`\n[ ${i + 1} / ${records.length} ]`);
        const ok = await submitOne(rec, opts);
        if (ok) passed++;
        else failed++;
    }
    console.log(`\n提交完成: ✓${passed} ✗${failed}`);
}

// submit 时需要题目 chapName; 记录里已存, 但为保险允许从 catalog 修复
export async function fixMissingMeta(records: AnswerRecord[]): Promise<void> {
    const missing = records.filter((r) => !r.chapName || !r.eid);
    if (missing.length === 0) return;
    const catalog = await getCatalogList();
    for (const rec of missing) {
        const p = catalog.data.find((x) => x.pname === rec.pname);
        if (p) {
            rec.chapName = p.chapName;
            rec.eid = p.eid;
            rec.questionType = p.questionType;
            await saveAnswer(rec);
        }
    }
}
