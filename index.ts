// 重构的 index.ts 文件 - 先编译再运行
import { getCatalogList } from "./api/getCatalogList";
import type { GetCatalogListResponse, CatalogItem } from "./types/catalog";
import { solve } from "./utils/solve";

// 主函数
async function main() {
    try {
        console.log("正在获取题目列表...");
        const catalogResponse: GetCatalogListResponse = await getCatalogList();
        const problems: CatalogItem[] = catalogResponse.data;

        console.log(`成功获取 ${problems.length} 个题目`);

        // 处理所有题目
        const problemsToProcess = problems;

        for (let i = 0; i < problemsToProcess.length; i++) {
            const problem = problemsToProcess[i]!;
            if (problem?.pass) {
                // console.log(`题目 ${problem.pname} 已通过，跳过`);
                continue;
            }
            console.log(
                `\n[ ${i + 1} / ${problemsToProcess.length} ] 处理题目: ${problem.pname}`,
            );
            await solve(problem, i, problemsToProcess.length);
        }
    } catch (error) {
        console.error("程序执行失败:", error);
        process.exit(1);
    }
}

// 运行主函数
main();
