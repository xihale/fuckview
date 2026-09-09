# 04 · scheme-service 接口（作业表/题目/模板）

来源：`api/modules/Work.js` + `api/modules/xdb/{Oj,Lab}.js` 的模板/文件部分。

## 目录与作业表

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/scheme-service/scheme/list/student`（params） | 学生作业计划列表 |
| GET | `/scheme-service/catalog/list?schemeId=&classId=` | 某作业表全部题目目录 → `CatalogItem[]` |
| GET | `/scheme-service/scheme/list/student/detail/{exerciseId}` | 题目目录外信息（教师调试页用） |

`CatalogItem`（fuckView `types/catalog.ts` 已建模）：

```ts
{ difficulty, eid, pass, pname, kind, pmemo, maximumSimilarity,
  comment, accumTime, questionType, chapName, commentStatus }
```

- `eid` 是题目 ID（后续所有 gdb/exam 接口的 `eID`）。
- `questionType`：1=普通编程题 2=实验题 3+=课程设计（详见 [01 架构](01-architecture.md)）。
- `accumTime` 累计做题时长（刷时长的观测指标）；`maximumSimilarity` 查重相似度。

## 题面

| 方法 | 路径 | 返回 data |
|---|---|---|
| GET | `/scheme-service/scheme/list/student/{eID}` | 普通编程题：`{questionFullName, questionId, kind, doc, language, completes, stuCode}` |
| GET | `/scheme-service/scheme/list/student/lab/{id}` | 实验题：含 `codeInfos[]`（多文件） |
| GET | `/scheme-service/scheme/list/student/courseDesign/{id}` | 课设题 |

- `doc` = 题面 HTML。**弹窗练习题的按钮就埋在实验题 doc 里**：`<button id="<前缀>_<practiceQuestionId>">…</button>`。
- `questionFullName` 和 `kind` 是判题必需的（成组运行/编译参数；部分题要"借"第 1 题的值，见 noview readme）。
- `language`：1=C/C++ 族（实测 1 可用）；`kind` 与题型/函数签名相关（fuckView 默认 4）。
- `stuCode`：上次保存的代码（Base64）。

## 代码模板与课设文件

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/scheme-service/scheme/getQuestionTemplate/student/{eID}` | 普通题默认模板 |
| GET | `/scheme-service/scheme/getQuestionTemplate/lab/student/{eID}` | 实验题默认模板 |
| POST | `/scheme-service/courseDesignQuestion/saveFile?exerciseId={eid}`（form: `file`） | 课设上传附件 |
