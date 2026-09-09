# 03 · user-service 接口

除登录族（见 [02](02-auth-and-login.md)）外，学生端用到的还有（`api/modules/TeacherDebug.js`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/user-service/teacher/currentTeacher` | 当前教师信息（教师调试页用） |
| GET | `/user-service/student/getLabExerciseStudentInfo` | 拉某学生实验题做题信息（教师查看） |

`student` 登录响应对象（`data.student`）在多处使用：`id`、`name`、`email`、`schoolId` 等；前端把 `String(student.id)` 写进 `window.userConfig.id`。

> 学生端对 user-service 的调用面很窄；账号资料类操作（改密/邮箱）见 [02](02-auth-and-login.md) 的端点表。
