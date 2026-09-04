// fuckView CLI
// 用法: bun index.ts <command> [options]
//
// 命令:
//   legacy          老流程: 直接用 data/ 里现成答案跑一遍(原 main 逻辑)
//   write           用硅基流动 batch 为未通过题目生成答案, 落盘到 gen/
//   submit          刷时长后逐题提交 gen/ 里的答案, 通过则放入 data/
//   fix             对 failed 的答案带错误信息重新生成(默认最多 3 次)
//   all             全自动: write -> submit -> fix -> submit -> ... 直到无 pending/failed
//   status          查看本地答案进度统计
//   recover <id>    batch 中断后按 batch id 恢复下载结果
//   list-batches    列出历史 batch 记录

import { getCatalogList } from "./api/getCatalogList";
import type { GetCatalogListResponse, CatalogItem } from "./types/catalog";
import { solve } from "./utils/solve";
import { writeAnswers, ingestBatchResults } from "./utils/write";
import { submitAnswers, type SubmitOptions } from "./utils/submit";
import { fixAnswers } from "./utils/fix";
import { loadAllAnswers } from "./utils/store";
import { retrieveBatch } from "./api/siliconflow";

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
    limit?: number;
    maxAttempts: number;
    submitOpts: SubmitOptions;
}): Promise<void> {
    console.log("========= [1/2] write: 批量生成 =========");
    await writeAnswers({ model: opts.model, limit: opts.limit });
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
    if (pname) submitOpts.pnames = [pname];

    switch (cmd) {
        case "legacy":
            await legacy();
            break;
        case "write":
            await writeAnswers({
                model: optStr("model"),
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
                limit: optInt("limit"),
                dry: opt("dry") === true,
                maxAttempts: optInt("max-attempts"),
                pnames: pname ? [pname] : undefined,
            });
            break;
        case "all":
            await runAll({
                model: optStr("model"),
                limit: optInt("limit"),
                maxAttempts: optInt("max-attempts") ?? 3,
                submitOpts,
            });
            break;
        case "status":
            await status();
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
  all [--brush 8-18] [--model m] [--max-attempts 3]
                         全自动: write -> submit -> fix/submit 循环到结束
  write [--model m] [--limit n] [--dry]
                         硅基流动 batch 批量生成未通过题目的答案 -> gen/
  submit [--brush 8-18] [--pname CP03EX010] [--no-brush]
                         刷时长后逐题提交 gen/ 中 pending 的答案, 通过则放入 data/
  fix [--model m] [--max-attempts 3] [--pname xxx]
                         对 failed 答案带错误信息重新生成
  status                 查看进度统计
  recover <batch_id>     恢复中断的 batch 下载结果
  list-batches           列出历史 batch`;

main().catch((err) => {
    console.error("执行失败:", err);
    process.exit(1);
});
