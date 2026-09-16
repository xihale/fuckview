// data 仓库路由: 按题号前缀自动选择课程对应的答案仓库
//   C 程序设计 (CP*)     -> data/    Chapter{N}/{pname}.c        (Anyview-Programming2024, ver25 分支)
//   数据结构   (DC*/DS*) -> data-ds/ Homework/Chapter{N}/{pname}.cpp (Anyview-DataStructure2025)
// 实验题 (ES) 上游是多文件目录 Experiment/Chapter{N}/{pname}/, 单文件提交流程用不到
import { join } from "path";

export function dataRootOf(pname: string): string {
    return pname.startsWith("CP") ? "data" : "data-ds";
}

// 按各仓库实际布局探测现成答案文件 (e 后缀/扩展名差异都靠逐个候选兜底)
export async function findAnswerFile(
    pname: string,
    chapName: string | number,
): Promise<string | undefined> {
    const root = dataRootOf(pname);
    const chapter = `Chapter${chapName}`;
    const candidates = [
        join(root, chapter, `${pname}.c`),
        join(root, "Homework", chapter, `${pname}.cpp`),
        join(root, "Homework", chapter, `${pname}.c`),
        join(root, chapter, `${pname}.cpp`),
    ];
    for (const p of candidates) {
        if (await Bun.file(p).exists()) return p;
    }
    return undefined;
}

// 通过后的答案按仓库原生命名落盘
export function answerOutPath(pname: string, chapName: string | number): string {
    const root = dataRootOf(pname);
    const chapter = `Chapter${chapName}`;
    if (root === "data") return join(root, chapter, `${pname}.c`);
    return pname.includes("ES")
        ? join(root, "Experiment", chapter, pname, "Main.cpp")
        : join(root, "Homework", chapter, `${pname}.cpp`);
}
