// 挂机/刷时长: 通过 exam WS 401 计时消息对给题目积累 accumTime
// 只动计时器——不保存/覆盖任何代码, 不触发编译判题, pass 状态不变
// 机制(2026-09-07 实测, 见 analysis/10): 401 content=eID 开始计时,
// 401 content=null 停止, 服务端按墙钟差累计, 秒级精确;
// saveStudentCode/compile/init/release 打点不影响 accumTime
import { getCatalogList } from "../api/getCatalogList.ts";
import { ExamTimer } from "../api/examSocket.ts";
import { config } from "../api/config.ts";
import type { CatalogItem } from "../types/catalog.ts";

// 从区间/单值解析目标分钟数(区间随机取值)
export function resolveMinutes(minutes: number | [number, number]): number {
    if (typeof minutes === "number") return minutes;
    const [lo, hi] = minutes;
    return lo + Math.random() * (hi - lo);
}

export interface IdleOptions {
    // 每题挂机时长(分钟), 默认 [5, 10] 随机
    minutes: number | [number, number];
    pnames?: string[];
    limit?: number;
    includePassed?: boolean;
    fresh?: boolean;
    dry?: boolean;
    // 重挂上一轮 +0 的题(实验题 ES 系服务端不计时, 默认跳过并在开头列出)
    retryZero?: boolean;
}

const stateFile = () => `data/idle-state-${config.schemeId}.json`;

async function loadState(): Promise<Record<string, number>> {
    const f = Bun.file(stateFile());
    if (!(await f.exists())) return {};
    return (await f.json()) as Record<string, number>;
}

async function saveState(state: Record<string, number>): Promise<void> {
    await Bun.write(stateFile(), JSON.stringify(state, null, 2));
}

// 给单题挂 minutes 分钟: 建连 → 401 开始 → 分片睡眠(断线重连续挂) → 401 停止
export async function holdTiming(eid: number, minutes: number): Promise<void> {
    const timer = new ExamTimer();
    await timer.connect();
    timer.startTiming(eid);
    let remainMs = minutes * 60 * 1000;
    while (remainMs > 0) {
        if (timer.isKicked) {
            timer.close();
            throw new Error("token 失效(WS type=119), 请重新登录后重跑");
        }
        const slice = Math.min(20000, remainMs);
        await Bun.sleep(slice);
        remainMs -= slice;
        if (remainMs > 0 && !timer.isOpen) {
            console.log(`  ⚠ WS 断开, 重连续挂剩余 ${(remainMs / 60000).toFixed(1)} 分钟`);
            timer.close();
            await Bun.sleep(3000);
            await timer.connect();
            timer.startTiming(eid);
        }
    }
    timer.stopTiming();
    await Bun.sleep(2000);
    timer.close();
}

export async function brushIdle(opts: IdleOptions): Promise<void> {
    const catalog = await getCatalogList();
    let targets: CatalogItem[] = catalog.data.filter(
        (q) => opts.includePassed || !q.pass,
    );
    if (opts.pnames?.length) {
        targets = targets.filter((q) => opts.pnames!.includes(q.pname));
    }
    const state = opts.fresh ? {} : await loadState();
    // state 值语义: >0 = 已挂到账; 0 = 上轮挂了但 accumTime 没涨(实验题不计时/token 失效), 默认跳过
    const zeroDone = targets.filter((q) => state[String(q.eid)] === 0);
    targets = targets.filter((q) => {
        const v = state[String(q.eid)];
        return v === undefined || (v === 0 && opts.retryZero === true);
    });
    if (opts.limit) targets = targets.slice(0, opts.limit);

    const [lo, hi] = Array.isArray(opts.minutes)
        ? opts.minutes
        : [opts.minutes, opts.minutes];
    const estH =
        (targets.length * (((lo as number) + (hi as number)) / 2) * 60 + targets.length * 25) /
        3600;
    console.log(
        `挂机目标 ${targets.length} 题, 每题 ${lo}${
            lo !== hi ? `~${hi}` : ""
        } 分钟随机, 预计墙钟 ${estH.toFixed(1)} 小时`,
    );
    if (zeroDone.length > 0) {
        console.log(
            `ℹ 另有 ${zeroDone.length} 题上轮没涨(记 0, 默认跳过): `
            + zeroDone.map((q) => q.pname).join(", ")
            + `—— 实验题(ES)服务端不计时属正常; 要重挂加 --retry-zero`,
        );
    }
    if (targets.length === 0) {
        console.log("没有待挂机的题目 (已完成/被过滤)");
        return;
    }
    if (estH > 6) {
        console.log("⚠ 预计超过 6 小时: token 有效期约 12 小时, 中途过期需重新登录后再跑(进度已存盘可续)");
    }
    if (opts.dry) {
        for (const q of targets) {
            console.log(
                `  ${q.eid} ${q.pname} 第${q.chapName}章 accumTime=${q.accumTime}s pass=${q.pass}`,
            );
        }
        console.log("(dry, 不执行)");
        return;
    }

    for (const [i, q] of targets.entries()) {
        const minutes = resolveMinutes(opts.minutes);
        const base = q.accumTime;
        console.log(
            `\n[${i + 1}/${targets.length}] ${q.pname} (${q.eid}) 第${q.chapName}章 `
            + `现累计 ${base}s → 挂 ${minutes.toFixed(1)} 分钟`,
        );
        await holdTiming(q.eid, minutes);

        // 复核 accumTime 真涨了; 没涨记 0(下轮默认跳过, --retry-zero 重挂)
        let gained = 0;
        try {
            const fresh = await getCatalogList();
            const now = fresh.data.find((x) => x.eid === q.eid)!;
            gained = now.accumTime - base;
            console.log(
                `  ${gained > 0 ? "✓" : "⚠"} accumTime ${base} → ${now.accumTime}s `
                + `(本轮 +${gained}s)`,
            );
        } catch (err) {
            console.log(`  ⚠ 复核失败: ${err}`);
        }

        state[String(q.eid)] = gained > 0 ? minutes : 0;
        await saveState(state);
        // 换题间隙, 仿人翻题节奏
        await Bun.sleep(8000 + Math.random() * 15000);
    }

    console.log(`\n挂机完成, 进度在 ${stateFile()}`);
}
