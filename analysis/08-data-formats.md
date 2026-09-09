# 08 · 数据格式、判题机制与坑

## 响应封装

所有 HTTP 服务统一 `{code, message?, data}`；成功码 `[200, 0]`，废弃兼容 `[31, 41, 70]`。WS 是 `{type, content?, timestamp, token}` 信封（见 [07](07-exam-service.md)）。

## Base64 的使用点

| 字段 | 编码内容 |
|---|---|
| `stuCode` / `studentCode` / `codeInfos[].codeContent` | 学生代码原文（编码前 trim） |
| `exerciseContent`（弹窗练习/作业答案） | 答案原文（选择题=数组字面量字符串，解答/编程=HTML） |

统一 `js-base64`（非 unicode 安全场景与 Buffer.from 等价，fuckView 用 Buffer）。

## 表单参数拍平 fn()

gdb-service OJ 变体的 multipart 参数来自 `fn()`：嵌套对象拍平成点路径键（`questionRes.questionFullName`），数组用 `arr.[0]`。所以接口文档里看到的"扁平带点字段名"就是这么来的（[06](06-gdb-service.md)）。

## 判题机制与 `=RIGHT=` 魔法（⚠️ 2026-09-07 实测已失效）

前端输出渲染处（`store/actions.js` setOutput）定义四个判题 tag：`===RIGHT=== / ===ERROR=== / ---RIGHT--- / ---ERROR---`——这些只是**渲染后端汇总报告**用的，不是判题接口。

**noview readme 记载的"输出含 `=RIGHT=` 子串即判过"是 2020 时代老后端的行为，2026 后端已不成立。** 实测（scheme 465，DC06PE23 函数补全题 + CP01EX025 整程题，共 5 种变体）：

| 实验 | 结果 |
|---|---|
| 函数补全题，函数体 `printf("=right=")` | 每组全部 `--------ERROR--------`，`passed=false right=0` |
| 同上，`printf("===RIGHT===")` | 同上 |
| 同上，`printf("========RIGHT========")` | 同上 |
| 整程题（自带 main），输出小写 `=right=` | 该组 ERROR |
| 整程题，输出大写 `=RIGHT=` | 该组 ERROR |

现行为：**逐测试组字面比对"你的结果" vs "系统结果"**，通过组打 `========RIGHT========`（8 等号）、失败组打 `--------ERROR--------`；`RunData.passed` 是权威判定。每组判过的边界怪癖：期望输出为空、实际非空时曾观察到判 RIGHT（疑似子串包含式比较），但对"打印 tag 骗过题"毫无帮助。

### runGroup 会话坑（实测）

- gdb-service 的编译工作目录**粘滞在会话首次编译的题目**（`/root/projects/<题目>/`），换 eID 重编译会撞上旧题的模板（`multiple definition of main`）。**换题前必须 `POST /gdb-service/code/release` 释放会话**。
- 每次 runGroup 只判**一组**数据（`order=N`），`runRightCount/runErrCount` 是该题历史累计计数而非本次结果；`passed` 才是本次判定。
- 函数补全题（如 `void printNoLessThanKey_InOrder(BiTree T, TElemType k)`）的模板 Dx.cpp 自带 main，学生代码**只能写函数不能写 main**；模板经 `GET /scheme-service/scheme/getQuestionTemplate/student/{eID}` 获取（Base64）。

## 两套题型枚举（易混）

| 枚举 | 值 | 用在哪 |
|---|---|---|
| catalog `questionType` | 1 编程(OJ) / 2 实验 / 3+ 课设 | scheme-service 目录、gdb 变体路由 |
| 练习题 `pq.type` | 1 单选 / 2 多选 / 3 解答 / 4 编程 | 弹窗练习题、HomeWork 题目 |

## 刷行为信号（⚠️ 2026-09-07 证伪，见 [analysis/10](10-accumtime-and-idle.md)）

- ~~`saveStudentCode` 是服务端记录做题行为的关键信号~~——实测对 accumTime **零影响**；
  compile/init/release 打点同样无效。
- `accumTime`（catalog，**单位秒**）唯一来源是 exam WS 的 401 计时消息对，实测挂 150s 恰 +150。
  批量挂机用 `bun index.ts idle`（`utils/idle.ts`）。

## 其他坑

- **WAF**：wzws，`wzws_sessionid` cookie 与 JWT 并行有效；bundle 有多缓存版本（加参数无用）。
- **单点登录**：别处登录会 403/WS 119 踢线，脚本运行时人再登录网页会把脚本顶掉。
- **幽灵 chunk**：`exercises-questions9092bde9` 永远 404。
- **sessionStorage.userMsg**：AES 加密的用户信息，key `anyview2020`（noview readme）。
- **StructV**（`src_full/structv/`）：fabric.js 的数据结构可视化引擎（栈/队列/链表/树等 RegisteredShape），课堂演示用，与判题无关。
- **zsh**：`echo ===` 会触发 glob/等号扩展，写分隔符别用裸等号串。
