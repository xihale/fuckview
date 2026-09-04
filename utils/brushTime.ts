// 刷时长: 提交前模拟做题行为, 让 accumTime 达到目标分钟数
// 策略: 每隔一个间隔调用一次 saveStudentCode (保存代码) + compile (编译, 失败也没关系, 只留行为记录),
// 直到从开始计时起经过的时间达到目标分钟数

import { saveStudentCode } from "../api/anyviewExtra";
import { compile } from "../api/compile";

export interface BrushOptions {
    // 目标时长(分钟). 传单个数字或 [min, max] 区间(随机取值)
    minutes: number | [number, number];
    // 行为间隔(秒), 默认 45s 打点一次
    intervalSec?: number;
    // 题目全名, 用于 compile
    questionFullName: string;
}

// 从区间/单值解析目标分钟数
export function resolveMinutes(minutes: number | [number, number]): number {
    if (typeof minutes === "number") return minutes;
    const [lo, hi] = minutes;
    return lo + Math.random() * (hi - lo);
}

// 刷时长: 阻塞直到目标时间达到. 每个间隔打点一次(保存代码+编译)
export async function brushTime(
    eID: string | number,
    code: string,
    opts: BrushOptions,
): Promise<number> {
    const targetMin = resolveMinutes(opts.minutes);
    const intervalSec = opts.intervalSec ?? 45;
    const targetMs = targetMin * 60 * 1000;
    const start = Date.now();
    let ticks = 0;

    console.log(
        `  ⏳ 刷时长: 目标 ${targetMin.toFixed(1)} 分钟, 每 ${intervalSec}s 打点一次`,
    );

    for (;;) {
        const elapsed = Date.now() - start;
        if (elapsed >= targetMs) break;

        ticks++;
        try {
            // 保存代码是主要行为信号; 编译失败不影响(人类也会编译失败)
            await saveStudentCode(eID, code);
            await compile(eID, code, opts.questionFullName);
        } catch (err) {
            // 打点失败不中断, 等下一轮
            console.log(`  ⚠ 打点 ${ticks} 失败: ${err}`);
        }

        const remainSec = Math.ceil((targetMs - elapsed) / 1000);
        const sleepSec = Math.min(intervalSec, remainSec);
        if (sleepSec <= 0) break;
        await Bun.sleep(sleepSec * 1000);
    }

    const finalMin = (Date.now() - start) / 60000;
    console.log(`  ⏳ 刷时长完成: ${finalMin.toFixed(1)} 分钟, 共 ${ticks} 次打点`);
    return finalMin;
}
