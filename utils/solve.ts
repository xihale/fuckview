import { compile, isCompileSuccess } from "../api/compile";
import { runGroup } from "../api/runGroup";
import type { CatalogItem } from "../types/catalog";
import { handleInput } from "./handleInput";
import { dataRootOf, findAnswerFile } from "./dataRepo";

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

// 获取答案内容: 按课程自动路由 data / data-ds 仓库并按其布局探测
async function getAnswer(
    problemName: string,
    chapName: string,
): Promise<string> {
    const answerPath = await findAnswerFile(problemName, chapName);
    if (!answerPath) {
        throw new Error(
            `${dataRootOf(problemName)} 仓库里没有 ${problemName} 的答案 (第${chapName}章)`,
        );
    }
    return await Bun.file(answerPath).text();
}
