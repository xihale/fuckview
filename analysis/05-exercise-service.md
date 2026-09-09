# 05 · exercise-service 接口（课程/统计）

来源：`api/modules/Center.ts`。这个服务偏"只读展示"，刷题自动化主要用不到，但课程发现链路（拿 schemeId/classId）从这里开始。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/exercise-service/courseArrange/list-term` | 学期列表 |
| GET | `/exercise-service/course/stu/list`（params） | **学生课程列表**（课程发现入口） |
| GET | `/exercise-service/scheme/stu/list`（params） | 作业表列表 |
| GET | `/exercise-service/ExerciseCorrect/list/problem-data`（params） | 作业表题目情况 |
| GET | `/exercise-service/ExerciseCorrect/problem-data`（params） | 指定题目平均数据 |
| GET | `/exercise-service/ExerciseCorrect/stu/visualChart/stuDetail`（params） | 学生个人图形概况 |
| GET | `/exercise-service/ExerciseCorrect/stu/visualChart/stuChapter`（params） | 章节图形概况 |
| GET | `/exercise-service/exercise/updateCommentStatus`（params） | 评语置为已读 |

`course/stu/list` 的 `data` 形状在平台各版本间不稳定（数组 / `{rows:[]}` / 嵌套 `course.class.scheme` 对象都有见过）——fuckView `api/getCourseList.ts` 里 `normalizeCourseList()` 已做多形态归一化，返回 `CourseOption{courseId?, courseName, schemeId, classId, termName?}`。
