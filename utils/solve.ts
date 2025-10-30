import { compile, isCompileSuccess } from "../api/compile";
import { runGroup } from "../api/runGroup";
import type { CatalogItem } from "../types/catalog";
import { join } from "path";
import { handleInput } from "./handleInput";

// 解决题目 - 先编译再运行
export async function solve(
    problem: CatalogItem,
    currentIndex: number,
    total: number,
): Promise<boolean> {
    const progress = `[ ${currentIndex + 1} / ${total} ]`;

    try {
        const answerCode = await getAnswer(problem.pname, problem.chapName);

        // 构建编译用的题目全名
        const questionFullName = `第${problem.chapName}章-${problem.pname}`;

        // 先编译
        const compileResult = await compile(
            problem.eid,
            answerCode,
            questionFullName,
        );
        if (!isCompileSuccess(compileResult)) {
            console.log(
                `${progress} ✗ 题目 ${problem.pname} 编译失败: ${compileResult.data.result}`,
            );
            return false;
        }

        const runGroupResult = await runGroup(problem.eid, answerCode, questionFullName);
        if (runGroupResult.data.passed)
            console.log(`${progress} ✓ 题目 ${problem.pname} 通过！`);
        else {
            if (runGroupResult.data.needInput){
                console.log(`${progress} 题目 ${problem.pname} 需要输入`);
                if (await handleInput(problem.eid, runGroupResult.data.output)){
                    console.log(`${progress} ✓ 题目 ${problem.pname} 通过！`);
                    return true;
                }
            }
            console.log(`${progress} ✗ 题目 ${problem.pname} 运行失败`);
            return false;
        }
    } catch (error) {
        console.log(`${progress} ✗ 题目 ${problem.pname} 处理异常: ${error}`);
    }

    return false;
}

// 配置信息
const DATA_DIR = "data";

// 从题目名称映射到答案文件名
function getAnswerFileName(problemName: string): string {
    // 直接使用题目名称，保留 'e' 后缀
    return `${problemName}.c`;
}

// 获取答案内容
async function getAnswer(
    problemName: string,
    chapName: string,
): Promise<string> {
    const answerFileName = getAnswerFileName(problemName);

    // 使用 chapName 构建章节目录
    const chapterDir = `Chapter${chapName}`;

    const answerPath = join(DATA_DIR, chapterDir, answerFileName);

    try {
        const answerFile = Bun.file(answerPath);
        return await answerFile.text();
    } catch (error) {
        throw new Error(`无法读取答案文件 ${answerPath}: ${error}`);
    }
}
