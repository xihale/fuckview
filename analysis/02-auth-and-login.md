# 02 · 登录与鉴权

来源：`views/HomePage/Login.vue` + `api/modules/Login.ts` + `api/protocol/http.ts`（学生端 v2025.9）。

## 登录流程

1. `GET /api/user-service/rsa` → 返回 RSA 公钥字符串（PEM）。
2. 前端用 JSEncrypt 加密 **`"${密码},${Date.now()}"`**（密码+逗号+当前毫秒时间戳整体加密，防重放）：
   ```js
   const encryptor = new JSEncrypt();
   encryptor.setPublicKey(publicKey);
   user.password = encryptor.encrypt(`${this.user.password},${new Date().getTime()}`);
   ```
3. `POST /api/user-service/login`（multipart/form-data）字段：

| 字段 | 值 | 说明 |
|---|---|---|
| `username` | 学号 | |
| `password` | RSA 密文 | `密码,时间戳` |
| `roleId` | `3` | 学生=3（其他角色见前端枚举；散客登录会改 schoolId） |
| `schoolId` | `63` | 广东工业大学（游客登录为 `-1`） |

4. 响应 `data = { student: {...}, token: "<JWT>" }`。token 存 vuex + `sessionStorage.token`，之后**每个请求由 axios 拦截器加 `token` 请求头**（实践上大小写均可）。`student` 对象同时写进 `sessionStorage.userMsg`（AES 加密，key=`anyview2020`，见 noview 逆向）。

## 会话存活与踢下线

- 业务失效：HTTP 401 → 跳登录；HTTP 403 → **"你的账号已在其他地方登录"**（单点登录），前端清空 localStorage/sessionStorage、断开测验 WS、回登录页。
- 测验页失效：WS 推 type `119`（同义 SSO 踢线）。
- WAF 会话：`wzws_sessionid` cookie；token 有效但 cookie 失效时网关可能直接拦（fuckView 需同时带 `Token` 头 + 该 cookie）。

## 其余鉴权相关端点（user-service）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/user-service/logout` 实为 `DELETE /user-service/logout` | 退出 |
| GET | `/user-service/school/listAll` | 学校列表 `School[]` |
| POST | `/user-service/register`（form） | 注册 |
| GET | `/user-service/sendAuthCode` | 发验证码 |
| GET | `/user-service/sendForUpdateAuthPwd` | 改密验证码 |
| GET | `/user-service/personal/forgot` | 忘记密码 |
| PUT | `/user-service/personal/password`（form） | 改密码 |
| PUT | `/user-service/personal/operate`（form） | 改邮箱 |
| GET | `/user-service/email` | 邮箱是否存在 |
| GET | `/user-service/isRegistered` | 邮箱是否已注册 |
| POST | `/gdb-service/code/release` | 退出/关页时释放 gdb 资源 |

## 已知坑（fuckView 实测）

- 密码**错误时服务端只回 `{"code":1,"message":"用户名或密码错误"}`**，无验证码/锁定提示，但连续错误有锁号风险（2026-09-07 实测 3 次失败即停）。
- 时间戳参与 RSA 明文，所以**不能离线预加密**密码复用——每次登录都要现算。
- 旧 JWT 过期表现：任意接口返回 403 `当前用户状态失效`。
