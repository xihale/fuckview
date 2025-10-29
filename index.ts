// 重构的 index.ts 文件 - 先编译再运行
import { getCatalogList } from "./api/getCatalogList";
import { compile } from "./api/compile";
import { runGroup } from "./api/runGroup";
import { join } from "path";
import { writeFileSync } from "fs";
import type { GetCatalogListResponse, CatalogItem } from "./types/catalog";

// 记录失败题目到文件
function logFailedProblem(problem: CatalogItem, reason: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] 题目: ${problem.pname}, 章节: ${problem.chapName}, 题目ID: ${problem.eid}, 失败原因: ${reason}\n`;

    try {
        const logPath = "debug_logs/failed_problems.log";
        writeFileSync(logPath, logEntry, { flag: "a" });
    } catch (error) {
        console.error(`无法记录失败题目: ${error}`);
    }
}

// 配置信息
const TRIES = 1;
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

// 解决题目 - 先编译再运行
async function solve(
    problem: CatalogItem,
    currentIndex: number,
    total: number,
): Promise<boolean> {
    const progress = `[ ${currentIndex + 1} / ${total} ]`;

    try {
        const answerCode = await getAnswer(problem.pname, problem.chapName);

        // 构建编译用的题目全名
        const questionFullName = `第${problem.chapName}章-${problem.pname}`;

        try {
            // 先编译
            await compile(problem.eid, answerCode, questionFullName);
        } catch (compileError) {
            console.log(
                `${progress} ✗ 题目 ${problem.pname} 编译失败: ${compileError}`,
            );
            logFailedProblem(problem, `编译失败: ${compileError}`);
            return false;
        }

        // 运行测试
        try {
            await runGroup(problem.eid, answerCode, questionFullName);
            console.log(`${progress} ✓ 题目 ${problem.pname} 通过！`);
            return true;
        } catch (error) {
            console.log(`${progress} ✗ 题目 ${problem.pname} 运行失败`);
            logFailedProblem(problem, `运行测试失败`);
            return false;
        }
    } catch (error) {
        console.log(`${progress} ✗ 题目 ${problem.pname} 处理异常: ${error}`);
        logFailedProblem(problem, `处理异常: ${error}`);
    }

    return false;
}

// 主函数
async function main() {
    try {
        console.log("正在获取题目列表...");
        const catalogResponse: GetCatalogListResponse = await getCatalogList();
        const problems: CatalogItem[] = catalogResponse.data;

        console.log(`成功获取 ${problems.length} 个题目`);

        // 处理所有题目
        const problemsToProcess = problems;

        // 逐个解决问题
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < problemsToProcess.length; i++) {
            const problem = problemsToProcess[i]!;
            console.log(
                `\n[ ${i + 1} / ${problemsToProcess.length} ] 处理题目: ${problem.pname}`,
            );
            if (problem?.pass) {
                console.log(`题目 ${problem.pname} 已通过，跳过`);
                continue;
            }
            const isSuccess = await solve(problem, i, problemsToProcess.length);

            if (isSuccess) {
                successCount++;
            } else {
                failureCount++;
            }
        }

        console.log(
            `\n处理完成: 成功 ${successCount} 题，失败 ${failureCount} 题`,
        );
        console.log(`失败题目详情已记录到 debug_logs 目录`);
    } catch (error) {
        console.error("程序执行失败:", error);
        process.exit(1);
    }
}

// 运行主函数
main();
