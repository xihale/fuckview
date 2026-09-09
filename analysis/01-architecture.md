# 01 · 平台架构

AnyView（`https://anyview.gdut.edu.cn`，"可调试的编程作业平台"）是广东工业大学的数据结构等课程的编程作业平台。
本文档基于 **学生端 v2025.9 前端源码**（webpack bundle 内嵌 sourcemap 完整还原，2026-09-07 确认线上仍是同一构建 `student428b7b3c.js`）。

## 微服务拓扑

前端是纯 SPA，所有请求打到网关 `/api/<服务名>/*`，由后端反代到各微服务：

| 服务 | 前端 base（`src/config/base.ts` → `src/api/base.ts`） | 职责 |
|---|---|---|
| `user-service` | `/api/user-service` | 登录/RSA/注册/个人信息/学校列表 |
| `exercise-service` | `/api/exercise-service` | 课程列表/学期/作业表列表/统计图表/评语 |
| `scheme-service` | `/api/scheme-service` | 作业表(scheme)/题目目录(catalog)/题面/代码模板/课设文件 |
| `gdb-service` | `/api/gdb-service/{code,debug,exercise}[/lab\|/courseDesign]` | 在线编译/运行/成组判题/GDB 调试/代码保存 |
| `exam-service` | `/api/exam-service`（HTTP）+ `wss:///api/exam-service/websocket`（WS） | 测验(考试)、实验题弹窗练习题、课后作业(HomeWork)、附件 |

WebSocket base = `wss://anyview.gdut.edu.cn/api`。gdb-service 有三个"变体"路径段：无后缀=普通编程题(OJ)、`/lab`=实验题、`/courseDesign`=课程设计题，三者的 code/debug/exercise 端点一一对应。

## 前端技术栈（来自 vendor chunk）

Vue 3.3.4 + Vuex + vue-router + element-plus 2.3.10 + monaco-editor 0.39 + jsencrypt 3.2.1（登录 RSA）+ js-base64 + axios + fabric 5.2.1（数据结构可视化引擎 **StructV**，`src_full/structv/` 有整套源码：Model/View/RegisteredShape/BehaviorHelper）+ echarts。

源码目录骨架（完整树见 `~/Desktop/anyview/fuckView-anyview-frontend-src.tar.gz`，已抽取去重版在 `/tmp/anyview/src/fe-student`）：

```
src/
├── api/
│   ├── base.ts                 # 各服务 URL
│   ├── protocol/http.ts        # axios 封装: 拦截器/响应封装/403 SSO 处理
│   ├── protocol/websocket-exam.ts  # 测验 WS 封装: 心跳/回调池/ack
│   └── modules/
│       ├── Login.ts  Center.ts  Work.js  TeacherDebug.js  HomeWork.ts
│       ├── exam/{interface,types,ws,http,index}.js   # 测验 WS+HTTP 双通道
│       └── xdb/{Oj.js,Lab.js,utils.js}               # gdb-service 调用(含表单参数拍平 fn())
├── store/                      # Vuex actions: compile/run/saveAnswer/调试/测验状态机
├── views/                      # Coding(编程题) LabCoding(实验题) exams(测验) HomeWork …
└── components/lab-coding-components/lab-coding-description.vue  # 弹窗答题 UI
```

## 题目形态（questionType）

catalog 里每道大题有 `questionType`：

- **1 = 普通编程题（OJ）**：单文件，走 `gdb-service/code/*`（multipart 表单），判题=成组运行 `runGroup`。
- **2 = 实验题（lab）**：多文件工程，走 `gdb-service/*/lab/*`（JSON body），页面里描述 HTML 含 `<button id="<前缀>_<practiceQuestionId>">`，点击弹出**练习题弹窗**（这就是"弹窗回答问题"的新接口，详见 [07](07-exam-service.md)）。
- **3+ = 课程设计（courseDesign）**：同 lab 但路径 `/courseDesign`，且请求字段 `labExerciseId` 改名 `courseDesignExerciseId`，支持附件上传。

> 注意区分：弹窗练习题自己的 `pq.type` 是 1单选/2多选/3解答/4编程(函数补全)/5编程(整文件)，与 catalog 的 questionType 是两套枚举。
>
> **2026 秋学期数据结构实际 ID**（2026-09-07 登录实测）：编程作业表 schemeId=465、实验作业表 schemeId=466（questionType=3，弹窗题所在），classId=381；仓库 env 里默认的 435/348 是 2025 学年的。

## bundle 与 sourcemap

- 入口 runtime：`/student/js/student428b7b3c.js`（webpack publicPath `/student/`）。
- 懒加载 chunk：`js/<name|id><hash8>.chunk.js` —— **name 与 hash 之间没有点**（`__webpack_require__.u` 返回 `"js/"+({names}[n]||n)+{hashes}[n]+".chunk.js"`），只有 14 个 chunk 有名字，其余是数字 id。
- **每个 chunk 尾部内嵌 `sourceMappingURL=data:application/json;charset=utf-8;base64,…`，带完整 `sourcesContent`**（原始 .vue/.ts 源码），整站源码可无损还原。
- 哈希表里有一条幽灵 `exercises-questions9092bde9`：服务端永远 404 返回 SPA 兜底 HTML，平台自身残留。
- **WAF 坑**：站点前有 wzws WAF（`wzws_sessionid` cookie），不同时刻/入口可能拿到不同缓存版本的 bundle；加 cache-busting 参数无效。好在源码内容各版本一致。

重新抓取全部 sourcemap：

```bash
bun analysis/tools/grab-sourcemaps.ts   # 输出到 analysis/sourcemaps/，清单见 sourcemaps/INDEX.md
```

## 响应封装与鉴权（所有服务通用）

```jsonc
// HTTP 响应统一封装 (protocol/http.ts)
{ "code": 200, "message": "", "data": … }
// 成功码 = [200, 0]，废弃兼容码 = [31, 41, 70]，其余前端弹错
```

- 请求头带 `token: <JWT>`（axios 拦截器自动加，来自 vuex/sessionStorage；fuckView 用大写 `Token` 同样有效），部分接口还要 `Eid: <eID>` 头（gdb-service）。
- Cookie `wzws_sessionid` 是 WAF 会话，与业务登录态并行。
- HTTP 403 → 前端判定"账号已在其他地方登录"（单点登录踢下线），清空存储回登录页；WS 侧同义信号是 type 119。
- HTTP 401 → 未授权，跳登录。

各服务细节：[02 auth](02-auth-and-login.md) · [03 user-service](03-user-service.md) · [04 scheme-service](04-scheme-service.md) · [05 exercise-service](05-exercise-service.md) · [06 gdb-service](06-gdb-service.md) · [07 exam-service](07-exam-service.md) · [08 数据格式与判题](08-data-formats.md)
