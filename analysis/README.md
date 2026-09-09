# AnyView 平台逆向分析（fuckView 配套）

来源：学生端 v2025.9 前端 bundle（`/student/js/student428b7b3c.js` + 114 个懒加载 chunk），**全部 sourcemap 内嵌完整 `sourcesContent`**，源码无损还原。2026-09-07 建档，当日验证线上仍是同一构建。

## 文档索引

| 文档 | 内容 |
|---|---|
| [01-architecture.md](01-architecture.md) | 微服务拓扑、前端栈、bundle/chunk 规则、响应封装、题型体系 |
| [02-auth-and-login.md](02-auth-and-login.md) | RSA 登录流程、token/cookie、踢下线、登录族端点 |
| [03-user-service.md](03-user-service.md) | 用户服务剩余端点 |
| [04-scheme-service.md](04-scheme-service.md) | 作业表/目录/题面/代码模板 |
| [05-exercise-service.md](05-exercise-service.md) | 课程发现/统计图表 |
| [06-gdb-service.md](06-gdb-service.md) | 编译/成组判题/交互输入/GDB 调试/存码（OJ、lab、courseDesign 三变体） |
| [07-exam-service.md](07-exam-service.md) | 测验 WS 协议、**实验题弹窗练习题（新接口）**、课后作业与附件 |
| [08-data-formats.md](08-data-formats.md) | Base64 约定、fn() 拍平、`=RIGHT=` 判题机制、两套题型枚举、刷行为信号、坑清单 |
| [09-waf-and-origin.md](09-waf-and-origin.md) | 云 WAF 行为、源站直连/XFF、借用判题实验、判题输出泄露完整答案 |
| [10-accumtime-and-idle.md](10-accumtime-and-idle.md) | **accumTime=exam WS 401 计时对**（HTTP 打点无效）、批量挂机 idle 命令 |

## 目录内容

- `sourcemaps/` — 117 个 `.map`（全部带 sourcesContent），清单见 [sourcemaps/INDEX.md](sourcemaps/INDEX.md)
- `tools/grab-sourcemaps.ts` — 平台发版后一键重抓：`bun analysis/tools/grab-sourcemaps.ts`

## 配套资源

- 完整还原源码树（2531 文件）：`~/Desktop/anyview/fuckView-anyview-frontend-src.tar.gz`（含 fe-student 学生端 + structv 可视化引擎）
- 去重版干净源码（读代码用）：`/tmp/anyview/src/fe-student`（重启丢失，可从 tarball 或 sourcemaps 重新抽）
- 统一 TS 类型：仓库 `types/index.ts`（barrel，按服务分文件）
- API 封装：`api/*.ts`（catalog/course/compile/runGroup/exeInput/saveStudentCode/exam 全家桶）

## 快速上手（写新自动化脚本）

```ts
import { config, header } from "../api/config.ts";   // ANYVIEW_TOKEN / ANYVIEW_COOKIE 环境变量
// 1. GET  /api/scheme-service/catalog/list?schemeId=&classId=   拿题目目录
// 2. GET  /api/scheme-service/scheme/list/student/{eID}          拿题面(questionFullName/kind)
// 3. POST /api/gdb-service/code/compile → runGroup               编译+判题
// 实验弹窗题: GET /api/exam-service/lab/practice/get/question/... + POST .../submit
// 全部细节见 06/07 文档；类型见 types/
```
