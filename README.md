# fuckview

## 声明

AnyView 并非很垃圾，其实在我看来还是挺不错的。

如果你根本就不会做里面的题目还来找这些邪门歪道，那我得 FUCK YOU 了！

使用这个脚本之前，请自己仔细想想！

## 工作流

```
┌─────────┐   batch api    ┌──────────────┐   轮询下载    ┌─────────┐
│ write   │ ─────────────► │ 硅基流动      │ ───────────► │ gen/    │
│ 批量生成 │                │ (半价离线)    │              │ 落盘     │
└─────────┘                └──────────────┘              └────┬────┘
                                                              │
┌─────────┐   刷时长(8~18min)   ┌─────────┐   通过            ▼
│ submit  │ ──────────────────► │ 编译/运行 │ ──────────► data*/Chapter*/
│ 逐题提交 │ ◄────────────────── │ 失败信息  │        (按题号自动选 data 或 data-ds)
└─────────┘                     └─────────┘
      │                              │
      ▼                              ▼
┌─────────┐   带错误信息重新生成   ┌─────────┐
│   fix   │ ──────────────────► │ batch / normal │  (最多 3 次)
└─────────┘                     └─────────┘
```

## 使用

环境变量（token 过期就用 `bun tools/origin/login2.ts <学号> <密码>` 重登，或 F12 抓包手填）：

| 变量 | 说明 |
| --- | --- |
| `ANYVIEW_TOKEN` | AnyView 登录 token（JWT，约 12h；后端重启也会失效），鉴权全靠它，cookie 非必需 |
| `ANYVIEW_SCHEME_ID` / `ANYVIEW_CLASS_ID` | 默认课程（2026 秋数据结构：465/381；不设则是上学年的 435/348） |
| `SILIKEY` | 硅基流动 key（batch 生成用，`.envrc`） |
| `OPENAI_API_KEY` | 普通 Chat Completions 生成用（`--mode normal`/`write-normal`），可选 `OPENAI_URL` 覆盖端点 |

命令总表：`bun index.ts help`。改完代码跑 `bun run typecheck` 验证。

普通 API（ForgeCode/Z.AI GLM Coding）使用 OpenAI 兼容的 Chat Completions 协议：设置
`OPENAI_API_KEY`（或 ForgeCode 的 `BIG_MODEL_API_KEY` / `ZAI_CODING_API_KEY`），可选设置
`OPENAI_URL`/`FORGE_API_URL`/`BIG_MODEL_URL` 覆盖端点。
默认端点为 `https://api.z.ai/api/coding/paas/v4`，默认模型为 `glm-5.3-flash`。

```bash
bun install

# 0. 全自动: write -> submit -> fix/submit 循环直到结束（挂后台跑）
bun index.ts all [--brush 8-18] [--max-attempts 3]

# 1. 批量生成未通过题目的答案（走硅基流动 batch API, 半价, 结果落盘到 gen/）
bun index.ts write [--model deepseek-ai/DeepSeek-V3.2] [--limit 20] [--dry]

# 1b. 普通 API 逐题生成（ForgeCode/Z.AI，默认模型 glm-5.3-flash）
OPENAI_API_KEY=... bun index.ts write-normal [--limit 20]
# 等价写法：bun index.ts write --mode normal --model glm-5.3-flash

# 2. 逐题提交: 先刷时长(默认每题随机 8~18 分钟, exam WS 计时), 再编译+运行
bun index.ts submit [--brush 8-18] [--pname CP03EX010] [--limit 5] [--no-brush]

# 2b. 批量挂机: 逐题 WS 计时给每题积累 accumTime(不改代码/不判题/pass 不变)
bun index.ts idle --scheme 465 --class 381 [--brush 5-10] [--limit 20] [--dry]
#     断点续挂(默认按 gen/idle-state-<schemeId>.json 跳过已挂题), --fresh 重来
#     连已通过的题也挂: --include-passed
#     state 值语义: >0=已到账; 0=上轮挂了没涨(默认跳过, --retry-zero 重挂)
#     已知不涨的: 已 pass 的题(服务端忽略) 和实验题 ES 系(465/466 服务端均不计时)

# 3. 失败的题目带错误信息重新生成, 然后再 submit（默认最多 3 次）
bun index.ts fix [--max-attempts 3] [--pname xxx]
# 修复也可切换普通 API：bun index.ts fix --mode normal --model glm-5.3-flash

# 辅助
bun index.ts status          # 进度统计
bun index.ts list-courses    # 列出当前账号可用课程
bun index.ts select-course 2 # 查看/选择第 2 门课程
# 课程选择也可以直接附在流程命令上（只对本次运行生效）
bun index.ts write --course 2 --mode normal --limit 20
bun index.ts all --course 2 --mode normal
bun index.ts recover <id>    # 恢复中断的 batch
bun index.ts list-batches    # 历史 batch
bun index.ts legacy          # 老流程: 直接用 data/ 或 data-ds/ 现成答案逐题提交
```

注意: `submit` 刷时长是真实等待（默认每题 8~18 分钟），挂后台跑。`submit` 只提交 pending 的答案；failed 的先 `fix` 重新生成再提交，避免浪费刷时长的等待。课程选择不会改写 `api/config.ts`，进程结束后恢复默认；也可用 `ANYVIEW_SCHEME_ID`/`ANYVIEW_CLASS_ID` 设置默认课程。

## 挂机/accumTime 机制（⚠️ 2026-09-07 实测）

服务端累计做题时长 `accumTime`（目录接口，单位秒）的唯一来源是 **exam WebSocket 的 401 计时消息对**：
连 `wss://…/api/exam-service/websocket/{token}`，发 `{type:401, content:eID}` 开始计时、
`{type:401, content:null}` 停止（对应前端"关闭题目面板=开始计时/打开面板=取消计时"），40s 心跳 `type:117`。
实测挂 150s accumTime 恰好 +150，秒级精确。**saveStudentCode/compile/init/release 打点一秒都不加**——
老版 brushTime 的"保存+编译打点刷时长"是无效的，已换成 WS 计时（`utils/idle.ts` 的 `holdTiming`）。
批量挂机用 `idle` 命令（逐题随机时长，只动计时器，不动代码不判题）。详见 `analysis/10-accumtime-and-idle.md`。

## 目录

- `api/` AnyView 接口封装 + 硅基流动 batch / OpenAI 兼容普通 API 客户端
  - `api/anyviewExam.ts` 弹窗答题(实验题练习题) / 作业 / 测验接口（v2025.9 前端逆向）
- `utils/` write(生成)/submit(提交)/fix(修复) 流程、挂机计时 idle、prompt、本地存储
- `gen/` 生成的答案库（gitignore）：`answers/` 每题状态、`attempts/` 历史尝试、`batches/` 任务记录
- `data/` C 程序设计答案（submodule `Anyview-Programming2024`，跟踪上游 `ver25` 分支；提交通过后自动写入 `data/ChapterX/xxx.c`）
- `data-ds/` 数据结构答案（submodule `Anyview-DataStructure2025`，跟踪上游 `master`；作业写入 `data-ds/Homework/ChapterX/xxx.cpp`）
  - 读取/写入按题号自动选仓库（`utils/dataRepo.ts`）：`CP*` → `data/`，`DC*`/`DS*` → `data-ds/`
  - 更新两个子模块到上游最新：`git submodule update --remote data data-ds` 后提交指针变化
- `types/` AnyView 统一 TS 类型（`types/index.ts` barrel，按服务分文件）
- `analysis/` **平台逆向分析工程**：10 篇文档（架构/鉴权/五服务/数据格式与判题/WAF 与源站直连/accumTime 与挂机）+ 117 个 sourcemap（`analysis/sourcemaps/INDEX.md`）+ 一键重抓脚本 `bun analysis/tools/grab-sourcemaps.ts`；完整源码树归档在 `~/Desktop/anyview/fuckView-anyview-frontend-src.tar.gz`
- `tools/origin/` 直连校内源站工具箱（被云 WAF 拉黑时用）：TLS 直连客户端 + XFF 登录 + stuCode 快照恢复，见该目录 README 与 `analysis/09-waf-and-origin.md`

## 弹窗答题（实验题练习题，v2025.9 新接口）

数据结构课程的实验题描述页（课前预习/课堂学习/课后复习）里嵌有练习题按钮，点击弹窗作答。
接口前缀 `https://anyview.gdut.edu.cn/api/exam-service`，请求头带小写 `token`，成功码 200/0：

| 功能 | 接口 |
| --- | --- |
| 某实验题全部练习题 | `GET /lab/practice/get/question/{schemeId}/{labExerciseId}` |
| 自己已提交的全部答案(含参考答案) | `GET /lab/practice/get/exercise/{labExerciseId}` |
| 单题自己的答案 | `GET /lab/practice/get/exercise/one/{practiceQuestionId}` |
| 提交/暂存 | `POST /lab/practice/submit` `{practiceQuestionId, exerciseContent(B64), isTempSaved}` |

题型：1 单选 / 2 多选 / 3 解答 / 4 编程(函数补全) / 5 编程(整文件)。答案原文格式：选择题
`[true,false,...]`（与选项等长，全 false 会被拒）、文本题 HTML；统一 Base64 后放 `exerciseContent`。
`isTempSaved=true` 暂存可改，`false` 定稿锁定并显示参考答案。

⚠️ ID 语义（2026-09-07 实测）：`get/question/{schemeId}/{X}` 的 X 是**题面 questionId**
（`scheme/list/student/lab/{eid}` 返回的 `data.questionId`），`get/exercise/{Y}` 的 Y 才是
**目录 eid**——传反会拿空列表。2026 秋数据结构：作业表 465(编程)/466(实验,弹窗题所在)，classId 381。

作业（HomeWork 页，整卷提交）走 `practice/exercise/*`；测验（Exams 页）走
`exam-service/websocket/{token}`（发送帧 `{type, content?, timestamp, token}`，206 拉安排、207 拉卷子、
208 交卷、117 心跳、222 确认、119 被踢）或同名 HTTP 表单端点（`examReInfoJsonStr` 字段）。
以上全部封装在 `api/anyviewExam.ts`。只读查看练习题状态：`bun index.ts practice [--eid N]`。

## =RIGHT= 判题机制（⚠️ 2026-09-07 实测已失效）

noview 记载的"输出含 `=RIGHT=` 即判过"是老后端行为。2026-09-07 用新 token 实测 5 种变体
（函数补全题打印小写/大写/8 等号 tag、整程题打印小写/大写），**全部不通过**：现在的后端是
逐测试组字面比对"你的结果 vs 系统结果"，前端见到的 `========RIGHT========` 标记只是后端
汇总报告。另有两个坑：gdb 会话的编译目录粘滞在首次编译的题，换题前必须 `POST
/gdb-service/code/release`；`runRightCount/runErrCount` 是历史累计不是本次结果。详见
`analysis/08-data-formats.md`。

**"借第一题通过情况"同样死亡（⚠️ 2026-09-07 实测）**：编译工作目录/模板按 eID 键控，
借 QF 不改编译环境（除第一题外全是带 Dx.cpp 的函数补全题，整程代码必 `multiple definition of main`）；
即使按模板签名补齐函数、用构造函数打印第一题期望输出，`(目标eID, 借来的QF)` 也查不到任何测试组
（right=0 err=0），pass 不落账。且 **compile/runGroup 会顺带覆盖目标题的 stuCode 存档**
——动别人题目前后务必快照/恢复（`tools/origin/restore-stucode.ts`）。详见 `analysis/09-waf-and-origin.md`。
流传的借题脚本 main.js（KeqingMoe-Hack）已逐字段复刻+本体真跑双重验证死亡（同上篇）。

**✅ 正经做题流程已验证（2026-09-07 晚，465 三题通过）**：老老实实写函数补全实现 →
`compile(自身 questionRes.questionFullName + eID + stuCode)` → `runGroup(自身 questionFullName/eID/kind,
C/C++ 不带 stuCode)` **一次调用判完全部组**（order=组数，`passed=true` + errorOrder 空 = 通过）→
目录 `pass=true` 落账。驱动 `solutions/465/run.ts`，三份实现同目录，真环境实测：
DC01PE06（三数降序）/ DC01PE08（多项式求值）/ DC06PE23（中序输出 ≥k 结点）。

## Reference

[noview](https://github.com/KeqingMoe/noview)
[bun.js](https://bun.com/)
