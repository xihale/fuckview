// ===== AnyView 统一类型出口 =====
// 按服务分文件，对应 analysis/ 文档：
//   common   → analysis/01-architecture.md（响应封装/RunData）
//   user     → analysis/02-auth-and-login.md
//   catalog  → analysis/04-scheme-service.md（题目目录）
//   scheme   → analysis/04-scheme-service.md（题面）
//   gdb      → analysis/06-gdb-service.md（编译/判题/实验题请求体）
//   exam     → analysis/07-exam-service.md（测验 WS/弹窗练习题）
//   homework → analysis/07-exam-service.md §C（课后作业）
//   course   → analysis/05-exercise-service.md（课程发现归一化）
// compile/runGroup/executeInput 为兼容薄层，统一从 gdb.ts 出。

export * from "./common.ts";
export * from "./user.ts";
export * from "./catalog.ts";
export * from "./scheme.ts";
export * from "./gdb.ts";
export * from "./exam.ts";
export * from "./homework.ts";
export * from "./course.ts";
export * from "./executeInput.ts";
export * from "./runGroup.ts";
export * from "./compile.ts";
