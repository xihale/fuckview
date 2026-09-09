# 06 · gdb-service 接口（编译/判题/调试/存码）

来源：`api/modules/xdb/{Oj,Lab,utils}.js` + `store/actions.js`（payload 组装）。gdb-service 按题型分三个变体：

| 变体 | code | debug | exercise | body 风格 |
|---|---|---|---|---|
| 普通编程题(OJ) | `/code` | `/debug` | `/exercise` | multipart 表单（`fn()` 拍平） |
| 实验题 | `/code/lab` | `/debug/lab` | `/exercise/lab` | **JSON** |
| 课程设计 | `/code/courseDesign` | `/debug/courseDesign` | `/exercise/courseDesign` | JSON，字段 `labExerciseId`→`courseDesignExerciseId` |

**三个变体的绝大多数请求都要带 `Eid: <eID>` 请求头。**

`fn()`（xdb/utils.js）：把嵌套对象拍平成 `a.b` / `arr.[0]` 点路径键值再塞表单——OJ 变体的表单字段是拍平后的。

## OJ 变体（普通编程题，fuckView 已实现）

| 方法 | 路径 | 参数（multipart） | 返回 data |
|---|---|---|---|
| POST | `/gdb-service/code/compile` | `questionRes.questionFullName`, `eID`, `stuCode`(b64), `isTeacher=false`, `isDebug=false` | `{result, cmpRightCount, cmpErrorCount}`；`result` 含 "编译成功" 即过 |
| POST | `/gdb-service/code/runGroup` | `questionFullName`, `eID`, `isTeacher`, `kind`, `language`, `stuCode`(b64) | `RunData`（见下） |
| POST | `/gdb-service/code/exeInput` | `inputStr`, `isTeacher`, `language`, `kind`, `eID` | `RunData`（交互输入喂入） |
| POST | `/gdb-service/code/interruptInput` | 同上 | 终止输入 |
| PUT | `/gdb-service/code/init` | `{languageId, workType}`（实验题专用初始化） | |
| POST | `/gdb-service/code/release` | 无 | 退出时释放 gdb 资源 |

> 前端 actions.js 里 compile 还会传整个 `questionRes`（题面对象，删掉 doc/stuCode/language/kind/questionId/completes 后）；fuckView 实测只传 `questionRes.questionFullName` 字段名即可。

**`RunData`（成组判题/运行结果，runGroup & exeInput 同构）**：

```ts
{ exception: string; runErrCount: number; runRightCount: number;
  needInput: boolean;          // true → 再调 exeInput 喂输入
  errorOrder: Record<string, unknown>;  // 未通过的测试数据组
  backtrace: unknown[]; variables: unknown[]; watchPoint: Record<string, unknown>;
  output: string;              // 程序输出（判题 tag 就在这里找，见 08）
  lineNum: string; end: boolean; passed: boolean; order: number }
```

判过 = `passed` 或 `runErrCount==0 && end`；输出里出现判题 tag 也会被判过（见 [08](08-data-formats.md)）。

## exercise 子路径（存码/错误数据）

| 方法 | 路径 | 变体 | 说明 |
|---|---|---|---|
| POST | `/gdb-service/exercise/saveStudentCode` | OJ | **JSON** `{eID, studentCode(b64)}`，"保存代码"信号（刷时长锚点） |
| POST | `/gdb-service/exercise/lab/saveCode` | lab | JSON `{labExerciseId, codeInfos[], …}` |
| GET | `/gdb-service/exercise/pastCode` | 通用 | 拿已通过代码（无参） |
| GET | `/gdb-service/exercise/errorOrder` | 通用 | 未通过的测试数据集 |
| POST | `/gdb-service/exercise/handleErrorOrder` | 通用 | form: `errorOrder`,`id` 启用/禁用错误数据组 |
| POST | `/gdb-service/exercise/lab/delFile` | lab | 删文件 |

## debug 子路径（GDB 调试，实验题为主）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/gdb-service/debug/breakPoints`（query） | 取断点 |
| PUT | `/gdb-service/debug/breakPoints` | 增删断点 |
| POST | `/gdb-service/debug/setWatchPoint` | 观察点 |
| POST | `/gdb-service/debug/start` | 开启调试（body 含 `breakPointInfo[]`） |
| POST | `/gdb-service/debug/nextStep` | 单步/进入/继续 **三合一**（stepOver/stepInto/continue 全打这个） |
| POST | `/gdb-service/debug/skipOut` | 跳出函数 |
| POST | `/gdb-service/debug/quit` | 停止调试 |

## 实验题 compile/run 的 JSON payload（actions.js 组装逻辑）

```jsonc
// POST /gdb-service/code/lab/compile   (header Eid)
{ "questionFullName": "…", "labExerciseId": 123,
  "codeInfos": [ { "path": "main.cpp",        // 原 fileName，.o 文件跳过
                   "codeContent": "<base64>",  // Base64
                   "breakPoints": "" | [...] } ],
  "isTeacher": false, "isDebug": false }

// POST /gdb-service/code/lab/run      同构；courseDesign 变体把 labExerciseId 换成 courseDesignExerciseId
```
