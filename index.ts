// fuckView CLI — 用法: bun index.ts help
// 命令明细见文件底部 __USAGE__(help 命令打印同一份)。

import { getCatalogList } from "./api/getCatalogList";
import type { GetCatalogListResponse, CatalogItem } from "./types/catalog";
import { solve } from "./utils/solve";
import { writeAnswers, ingestBatchResults } from "./utils/write";
import { submitAnswers, type SubmitOptions } from "./utils/submit";
import { brushIdle } from "./utils/idle";
import { fixAnswers } from "./utils/fix";
import { loadAllAnswers } from "./utils/store";
import { retrieveBatch } from "./api/siliconflow";
import { listCourses, selectCourse } from "./utils/course";
import {
    getLabPracticeQuestions,
    getLabOwnAnswers,
    getLabQuestionMeta,
} from "./api/anyviewExam";
import type { PracticeOwnAnswer } from "./types/exam";
import { config, setCourseSelection } from "./api/config";

// practice: 只读列出实验题(弹窗答题)的练习题和作答状态, 不提交任何东西
async function listPractice(eid?: number): Promise<void> {
    const catalogResponse = await getCatalogList();
    let problems = catalogResponse.data;
    if (eid !== undefined) {
        problems = problems.filter((p) => p.eid === eid);
        if (problems.length === 0) throw new Error(`目录中没有 eid=${eid}`);
    } else {
        // 实验题/课设: 前端 getQuestionContent 里 questionType >= 3 走 LabCoding
        problems = problems.filter((p) => p.questionType >= 3);
    }
    if (problems.length === 0) {
        console.log("当前课程没有实验题 (弹窗答题只出现在实验题描述页里)");
        return;
    }
    // 题型码 2026-09-07 实测: 5 = 编程(整文件实现, 如 Main.cpp)
    const TYPE_NAME: Record<number, string> = {
        1: "单选", 2: "多选", 3: "解答", 4: "编程", 5: "编程(整文件)",
    };
    for (const p of problems) {
        // get/question 端点吃的是「题面 questionId」而非目录 eid (见 anyviewExam.ts 顶部注释)
        const meta = await getLabQuestionMeta(p.eid);
        const [questions, answers] = await Promise.all([
            getLabPracticeQuestions(config.schemeId, meta.questionId),
            getLabOwnAnswers(p.eid),
        ]);
        const answerOf = new Map<number, PracticeOwnAnswer>();
        for (const a of answers) answerOf.set(a.practiceQuestionId, a);
        console.log(
            `\n■ ${p.pname} (eid=${p.eid}, questionId=${meta.questionId}, 第${p.chapName}章) 练习题 ${questions.length} 道`,
        );
        for (const q of questions) {
            if (!q.pq) continue;
            const own = answerOf.get(q.practiceQuestionId);
            const done = own && String(own.pqe?.isTempSaved ?? "true") === "false";
            console.log(
                `  [${q.practiceQuestionId}] ${TYPE_NAME[q.pq.type] ?? q.pq.type}题`
                + ` ${q.pq.remark ?? ""} ${q.point != null ? `${q.point}分` : ""}`
                + ` | ${done ? "已提交" : own ? "仅暂存" : "未作答"}`
                + ` | 截止: ${q.finishTime ?? "无"}`,
            );
        }
    }
}

// 解析 --key value / --key=value / 布尔 flag
function parseArgs(argv: string[]): Record<string, string | boolean> {
    const args: Record<string, string | boolean> = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]!;
        if (a.startsWith("--")) {
            const eq = a.indexOf("=");
            if (eq > 0) {
                args[a.slice(2, eq)] = a.slice(eq + 1);
            } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) {
                args[a.slice(2)] = argv[++i]!;
            } else {
                args[a.slice(2)] = true;
            }
        }
    }
    return args;
}

// 解析 "8-18" 或 "10" 为分钟区间
function parseMinutes(
    v: string | boolean | undefined,
): number | [number, number] | undefined {
    if (typeof v !== "string") return undefined;
    if (v.includes("-")) {
        const parts = v.split("-").map(Number);
        const lo = parts[0];
        const hi = parts[1];
        if (lo !== undefined && hi !== undefined && !isNaN(lo) && !isNaN(hi)) {
            return [lo, hi];
        }
    }
    const n = Number(v);
    return isNaN(n) ? undefined : n;
}

// ============ 老流程 ============

async function legacy(): Promise<void> {
    console.log("正在获取题目列表...");
    const catalogResponse: GetCatalogListResponse = await getCatalogList();
    const problems: CatalogItem[] = catalogResponse.data;
    console.log(`成功获取 ${problems.length} 个题目`);

    for (let i = 0; i < problems.length; i++) {
        const problem = problems[i]!;
        if (problem?.pass) continue;
        console.log(`\n[ ${i + 1} / ${problems.length} ] 处理题目: ${problem.pname}`);
        await solve(problem, i, problems.length);
    }
}

// ============ status ============

async function status(): Promise<void> {
    const records = await loadAllAnswers();
    if (records.length === 0) {
        console.log("gen/ 为空, 先运行 write 生成答案");
        return;
    }
    const by = (s: string) => records.filter((r) => r.status === s).length;
    console.log(`总计 ${records.length} 题:`);
    console.log(`  ✓ passed : ${by("passed")}`);
    console.log(`  … pending: ${by("pending")}`);
    console.log(`  ✗ failed : ${by("failed")}`);
    const failed = records.filter((r) => r.status === "failed");
    if (failed.length > 0) {
        const exhausted = failed.filter((r) => r.attempt >= 3);
        console.log(`\n失败题目 ${failed.length} 道 (failed 且 attempt<3 可运行 fix):`);
        for (const r of failed) {
            const tag = r.attempt >= 3 ? " [已耗尽3次]" : "";
            console.log(`  ${r.pname} attempt=${r.attempt}${tag} ${r.lastError?.split("\n")[0] ?? ""}`);
        }
        if (exhausted.length > 0) {
            console.log(`\n其中 ${exhausted.length} 道已尝试 3 次仍失败, 建议人工处理或换模型: --pname xxx fix --model <另一个模型>`);
        }
    }
    const pending = records.filter((r) => r.status === "pending");
    if (pending.length > 0) {
        console.log(`\n待提交题目 (可运行 submit): ${pending.slice(0, 10).map((p) => p.pname).join(", ")}${pending.length > 10 ? " ..." : ""}`);
    }
}

// ============ batches ============

async function listBatches(): Promise<void> {
    const glob = new Bun.Glob("*.json");
    const records: { id: string; status: string; createdAt?: string; pnames?: string[] }[] = [];
    for await (const f of glob.scan({ cwd: "gen/batches" })) {
        const rec = await Bun.file(`gen/batches/${f}`).json();
        records.push(rec);
    }
    records.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    for (const r of records) {
        console.log(`${r.createdAt ?? "?"} ${r.id} ${r.status} (${r.pnames?.length ?? 0} 题)`);
    }
}

async function recover(batchId: string): Promise<void> {
    console.log(`恢复 batch ${batchId}...`);
    const batch = await retrieveBatch(batchId);
    console.log(`当前状态: ${batch.status}`);
    if (!["completed", "failed", "expired", "cancelled"].includes(batch.status)) {
        console.log("batch 尚未结束, 稍后再试或等待完成");
        return;
    }
    await ingestBatchResults(batchId);
}

// ============ all: 全自动循环 ============
// write -> submit -> (failed? fix -> submit) x maxAttempts

async function runAll(opts: {
    model?: string;
    mode?: "batch" | "normal";
    limit?: number;
    maxAttempts: number;
    submitOpts: SubmitOptions;
}): Promise<void> {
    console.log(
        `========= [1/2] write: ${opts.mode === "normal" ? "普通 API 生成" : "批量生成"} =========`,
    );
    await writeAnswers({ model: opts.model, mode: opts.mode, limit: opts.limit });
    console.log("\n========= [2/2] submit: 逐题提交 =========");
    await submitAnswers(opts.submitOpts);

    // failed 的循环 fix + resubmit
    for (let round = 2; round <= opts.maxAttempts; round++) {
        const failed = (await loadAllAnswers()).filter(
            (r) => r.status === "failed" && r.attempt < opts.maxAttempts,
        );
        if (failed.length === 0) break;
        console.log(
            `\n========= 第 ${round}/${opts.maxAttempts} 轮修复: ${failed.length} 道 =========`,
        );
        await fixAnswers({
            model: opts.model,
            mode: opts.mode,
            maxAttempts: opts.maxAttempts,
        });
        await submitAnswers(opts.submitOpts);
    }

    await status();
}

// ============ main ============

async function main() {
    const argv = process.argv.slice(2) as string[];
    const [cmd = "legacy", ...rest] = argv;
    const args = parseArgs(rest);
    const opt = (k: string): string | boolean | undefined => args[k];
    const optStr = (k: string): string | undefined => {
        const v = args[k];
        return typeof v === "string" ? v : undefined;
    };
    const optInt = (k: string): number | undefined => {
        const v = args[k];
        return typeof v === "string" ? parseInt(v) : undefined;
    };

    const submitOpts: SubmitOptions = {
        brushMinutes: parseMinutes(opt("brush")) ?? parseMinutes(opt("minutes")),
        limit: optInt("limit"),
        noBrush: opt("no-brush") === true,
    };
    const pname = optStr("pname");
    const courseSelector = optStr("course");
    const mode: "batch" | "normal" =
        opt("mode") === "normal" ||
        opt("api") === "normal" ||
        opt("normal") === true
            ? "normal"
            : "batch";
    if (pname) submitOpts.pnames = [pname];
    if (courseSelector && !["list-courses", "courses", "select-course", "course", "practice"].includes(cmd)) {
        await selectCourse(courseSelector);
    }

    switch (cmd) {
        case "help":
        case "--help":
        case "-h":
            console.log(`fuckView — 用法: bun index.ts <command> [options]${__USAGE__}`);
            break;
        case "legacy":
            await legacy();
            break;
        case "write":
            await writeAnswers({
                model: optStr("model"),
                mode,
                limit: optInt("limit"),
                dry: opt("dry") === true,
            });
            break;
        case "write-normal":
            await writeAnswers({
                model: optStr("model"),
                mode: "normal",
                limit: optInt("limit"),
                dry: opt("dry") === true,
            });
            break;
        case "submit":
            await submitAnswers(submitOpts);
            break;
        case "fix":
            await fixAnswers({
                model: optStr("model"),
                mode,
                limit: optInt("limit"),
                dry: opt("dry") === true,
                maxAttempts: optInt("max-attempts"),
                pnames: pname ? [pname] : undefined,
            });
            break;
        case "all":
            await runAll({
                model: optStr("model"),
                mode,
                limit: optInt("limit"),
                maxAttempts: optInt("max-attempts") ?? 3,
                submitOpts,
            });
            break;
        case "status":
            await status();
            break;
        case "practice":
            await listPractice(optInt("eid"));
            break;
        case "idle":
            if (optInt("scheme") && optInt("class")) {
                setCourseSelection({ schemeId: optInt("scheme")!, classId: optInt("class")! });
            }
            await brushIdle({
                minutes: parseMinutes(opt("brush")) ?? [5, 10],
                pnames: pname ? [pname] : undefined,
                limit: optInt("limit"),
                includePassed: opt("include-passed") === true,
                retryZero: opt("retry-zero") === true,
                fresh: opt("fresh") === true,
                dry: opt("dry") === true,
            });
            break;
        case "list-courses":
        case "courses":
            await listCourses();
            break;
        case "select-course":
        case "course":
            if (rest[0] && !rest[0].startsWith("--")) {
                await selectCourse(rest[0]);
            } else {
                await listCourses();
                console.log("用法: bun index.ts select-course <序号|courseId|schemeId|课程名>");
            }
            break;
        case "list-batches":
            await listBatches();
            break;
        case "recover":
            if (rest[0]) {
                await recover(rest[0]);
            } else {
                console.error("用法: bun index.ts recover <batch_id>");
                process.exit(1);
            }
            break;
        default:
            console.log(`未知命令: ${String(cmd)}`);
            console.log(__USAGE__);
            process.exit(1);
    }
}

const __USAGE__ = `
命令:
  legacy                 老流程: 直接用 data/ 现成答案逐题提交
  all [--brush 8-18] [--model m] [--max-attempts 3] [--course 2]
                         全自动: write -> submit -> fix/submit 循环到结束
                         加 --mode normal 使用普通 Chat Completions API
  write [--model m] [--limit n] [--dry] [--mode batch|normal] [--course 2]
                         生成未通过题目的答案（默认硅基流动 batch） -> gen/
  write-normal [--model glm-5.3-flash] [--limit n] [--dry]
                         使用 ForgeCode/Z.AI 普通 API 逐题生成答案 -> gen/
  submit [--brush 8-18] [--pname CP03EX010] [--no-brush] [--course 2]
                         刷时长后逐题提交 gen/ 中 pending 的答案, 通过则放入 data/
  fix [--model m] [--max-attempts 3] [--pname xxx] [--mode batch|normal] [--course 2]
                         对 failed 答案带错误信息重新生成
  status                 查看进度统计
  practice [--eid N]     只读列出实验题弹窗练习题与作答状态(不提交)
  idle [--brush 5-10] [--pname DC01PE18] [--limit n] [--course 2|--scheme 465 --class 381]
                         批量挂机: 逐题 WS 计时积累 accumTime(不改代码/不判题)
                         --include-passed 连已通过的题也挂; --fresh 清空挂机进度; --dry 只列出计划
                         --retry-zero 重挂上轮 +0 的题(实验题 ES 系服务端不计时, 默认跳过)
  recover <batch_id>     恢复中断的 batch 下载结果
  list-courses           列出当前账号可用课程
  select-course <选择>   选择课程（序号、courseId、schemeId 或完整名称）
  list-batches           列出历史 batch

课程选择（只对本次命令生效）:
  write --course 2       使用第 2 门课程生成答案
  submit --course 2      提交第 2 门课程的答案
  all --course 2         对第 2 门课程执行全流程`;

main().catch((err) => {
    console.error("执行失败:", err);
    process.exit(1);
});
