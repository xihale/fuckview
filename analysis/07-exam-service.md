# 07 · exam-service 接口（测验 WS / 弹窗练习题 / 课后作业）

来源：`api/modules/exam/{types,ws,http,interface}.js` + `api/protocol/websocket-exam.ts` + `api/modules/{Work.js,HomeWork.ts}` + `components/lab-coding-components/lab-coding-description.vue`。

exam-service 管三块业务：**测验（考试）**、**实验题弹窗练习题（lab practice，即"弹窗回答问题"新接口）**、**课后作业（HomeWork）**。

## A. 测验（考试）WebSocket

`wss://anyview.gdut.edu.cn/api/exam-service/websocket/{token}`

消息信封（两端同构）：`{ type, content?, timestamp, token }`；请求带本地时间戳做回调池 key，响应原样带回 timestamp。请求 15s 超时（心跳/ack/401 除外）。

| type | 含义 | 方向 |
|---|---|---|
| 117 | 心跳（每 40s） | C→S |
| 206 | 问"有没有考试安排"（WS 一打开就发） | C→S |
| 201/202/203/205/212 | 考试生命周期推送（开始/展开/结束/准备/无考试） | S→C，**必须回 222 ack** |
| 222 | 收到推送的确认 | C→S |
| 207 / 210 | 取题目列表 / 成功（`content.catalogs`） | C→S / S→C |
| 208 / 204 | 交卷 / 交卷成功 | C→S / S→C |
| 215 / 216 | 历史测验 / 成功 | C→S / S→C |
| 217 / 218 / 219 | 查是否已交卷 / 已交 / 未交 | C→S / S→C |
| 119 | 单点登录踢下线 | S→C |
| 401 | 页面停留超时后重连计时（content=当前题 index 或 null） | C→S |
| （statusType 403） | 停留过久服务端要求断开，点确定后发 401 重连 | S→C |

答题本身不走 WS：题目做答/保存与普通题一样打 gdb-service（`saveAnswer` → `oj.saveAnswer`），WS 只管考试生命周期。

**HTTP 兜底通道**（同样的六个操作，字段名 `examReInfoJsonStr` = JSON 字符串的 multipart 表单）：

| 方法 | 路径 | content |
|---|---|---|
| POST | `/exam-service/exam/getOneScheme` | `{schemeId, classId, vId, …}` → `content.catalogs` |
| GET | `/exam-service/exam/getExamPlan` | 考试安排 |
| POST | `/exam-service/exam/submitExam` | **`{schemeId, classId, vId}`**（三者都取自推送的 `content`，`vId` 即考试 id） |
| GET | `/exam-service/exam/getHistoryExam` | |
| POST | `/exam-service/exam/checkIfSubmited` | 同上 |
| GET | `/exam-service/exam/isAllPassed`（query） | 提前交卷的前置校验 |
| GET | `/exam-service/exam/getTime` | 服务器时间 |

## B. 实验题弹窗练习题（lab practice，2025.9 新接口）

实验题题面 HTML（2026 版起分三段：`beforeClass` 课前预习 / `onClass` 课堂学习 / `afterClass` 课后复习，`doc` 字段已空）里埋着弹窗按钮：

```html
<button id="p_{practiceQuestionId}" class="practice_question_button">练习题1</button>
```

点击弹出答题 dialog（`lab-coding-description.vue`）。

⚠️ **两套 ID 语义（2026-09-07 实测确认，传反会拿空列表/报"练习题不存在"）**：

| 端点 | 吃哪个 ID | 例子（DS02ES10） |
|---|---|---|
| `GET /lab/practice/get/question/{schemeId}/{X}` | **题面 `questionId`**（`scheme/list/student/lab/{eid}` 的 `data.questionId`） | 85 |
| `GET /lab/practice/get/exercise/{Y}` | **目录 `eid`**（catalog 的 eid） | 121201 |
| `GET /lab/practice/get/exercise/one/{qid}` | practiceQuestionId | 995 |

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/exam-service/lab/practice/get/question/{schemeId}/{questionId}` | 全部练习题 `PracticeQuestion[]` |
| GET | `/exam-service/lab/practice/get/exercise/{eid}` | 自己全部已提交答案 `PracticeOwnAnswer[]`（含系统预创建的空草稿） |
| GET | `/exam-service/lab/practice/get/exercise/one/{practiceQuestionId}` | 单题自己的答案 |
| POST | `/exam-service/lab/practice/submit` | **JSON** 提交/暂存答案（见下） |

提交体（`Work.saveExercisesAnswer` 同款）：

```jsonc
{ "practiceQuestionId": 123,
  "exerciseContent": "<base64>",  // Base64(答案原文)
  "isTempSaved": true }           // true=暂存草稿；false=终交（锁定并返回标准答案）
```

**exerciseContent 原文格式（按 pq.type）**：

- 选择题（type 1/2）：选项判断结果的**字符串化数组字面量**，如 `"[true,false,true]"`，长度=选项数（多选多 true）。**全 false 或空串会被后端拒**（"请确保至少输入了一个非空格字符"）。
- 解答（3）/编程（4）/整文件编程（5）：HTML 文本。type 5 = 整文件实现题（如写整个 Main.cpp），4 = 函数补全/改错。
- 终交后后端在下发答案时附 `pqd.optionSolution`（选择）与 `pqd.solutionContent`（解答/编程）。

> 2026 秋学期数据结构：作业表 schemeId **465**（编程题）/ **466**（实验题，questionType=3，弹窗题所在），classId 381。2025 的 435/348 是上学年的。

## C. 课后作业（HomeWork 页面）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/exam-service/practice/exercise/list`（params） | 作业列表 |
| GET | `/exam-service/practice/exercise/get/question/{id}` | 题目 |
| GET | `/exam-service/practice/exercise/get/exercise/{id}` | 自己的答案 |
| POST | `/exam-service/practice/exercise/submit` | 提交（JSON，同 lab practice 风格） |
| GET | `/exam-service/practice/exercise/get/score/{id}` | 分数 |
| GET | `/exam-service/practice/exercise/get/status/{practiceId}` | 状态（**2=已截止**） |
| GET | `/exam-service/course/get/filter/select` | 发布过练习的课程 id 数组 |
| POST | `/exam-service/practice/exercise/file`（form） | 上传附件 |
| GET | `/exam-service/practice/exercise/file/single/{exerciseId}` | 单个附件元数据 `{realFileName, time}` |
| GET | `/exam-service/practice/exercise/file/all/{practiceId}` | 全部附件 |
| POST | `/exam-service/practice/exercise/file/{time}/{realFileName}` | 下载附件（**responseType=blob**） |
| DELETE | `/exam-service/practice/exercise/file/{time}/{realFileName}` | 删附件 |

> Work.js 里也直接引用了 B 的三个 lab/practice 端点（前端两处入口共用同一接口）。
