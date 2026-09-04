// 本地生成结果存储层
// 目录结构:
// gen/
//   answers/{pname}.json        每题当前答案 + 状态
//   attempts/{pname}/{n}.c      历史尝试代码
//   batches/{id}.json           batch 任务记录
//   logs/submit.log             提交日志

import { join } from "path";
import type { CatalogItem } from "../types/catalog";

export const GEN_DIR = "gen";
export const ANSWERS_DIR = join(GEN_DIR, "answers");
export const ATTEMPTS_DIR = join(GEN_DIR, "attempts");
export const BATCHES_DIR = join(GEN_DIR, "batches");

export type AnswerStatus =
    | "pending" // 已生成未提交
    | "passed" // 提交通过
    | "failed"; // 提交失败(等 fix)

export interface AnswerRecord {
    pname: string;
    chapName: string;
    eid: number;
    questionType: number;
    status: AnswerStatus;
    code: string;
    attempt: number; // 当前是第几次生成 (1-based)
    lastError?: string; // 最近一次失败信息
    genModel?: string;
    genTime?: string;
    passedTime?: string;
}

function ensureDirSync(dir: string) {
    const fs = require("fs");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

export function ensureGenDirs() {
    for (const d of [GEN_DIR, ANSWERS_DIR, ATTEMPTS_DIR, BATCHES_DIR]) {
        ensureDirSync(d);
    }
}

function answerPath(pname: string): string {
    return join(ANSWERS_DIR, `${pname}.json`);
}

// 保存/更新答案记录
export async function saveAnswer(record: AnswerRecord): Promise<void> {
    ensureGenDirs();
    // 归档当前代码到 attempts
    const attemptDir = join(ATTEMPTS_DIR, record.pname);
    ensureDirSync(attemptDir);
    await Bun.write(join(attemptDir, `${record.attempt}.c`), record.code);
    await Bun.write(answerPath(record.pname), JSON.stringify(record, null, 2));
}

export async function loadAnswer(pname: string): Promise<AnswerRecord | null> {
    const f = Bun.file(answerPath(pname));
    if (!(await f.exists())) return null;
    return (await f.json()) as AnswerRecord;
}

// 保存 batch 任务记录
export async function saveBatchRecord(record: {
    id: string;
    inputFileId?: string;
    model: string;
    pnames: string[];
    status: string;
    createdAt: string;
    finishedAt?: string;
    outputLineCount?: number;
    errorLineCount?: number;
}): Promise<void> {
    ensureGenDirs();
    await Bun.write(
        join(BATCHES_DIR, `${record.id}.json`),
        JSON.stringify(record, null, 2),
    );
}

// 提交日志 (追加)
export async function appendSubmitLog(line: string): Promise<void> {
    ensureGenDirs();
    const fs = require("fs");
    fs.mkdirSync(join(GEN_DIR, "logs"), { recursive: true });
    const ts = new Date().toISOString();
    fs.appendFileSync(join(GEN_DIR, "logs", "submit.log"), `[${ts}] ${line}\n`);
}

// 从 CatalogItem 构造初始记录
export function newAnswerRecord(
    problem: CatalogItem,
    code: string,
    attempt: number,
    model?: string,
): AnswerRecord {
    return {
        pname: problem.pname,
        chapName: problem.chapName,
        eid: problem.eid,
        questionType: problem.questionType,
        status: "pending",
        code,
        attempt,
        genModel: model,
        genTime: new Date().toISOString(),
    };
}

// 全部答案记录
export async function loadAllAnswers(): Promise<AnswerRecord[]> {
    ensureGenDirs();
    const records: AnswerRecord[] = [];
    const glob = new Bun.Glob("*.json");
    for await (const file of glob.scan({ cwd: ANSWERS_DIR })) {
        const rec = await loadAnswer(file.replace(/\.json$/, ""));
        if (rec) records.push(rec);
    }
    return records;
}
