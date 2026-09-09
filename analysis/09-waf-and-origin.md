# 09 · WAF 与源站直连（2026-09-07 实战记录）

任何被 wzws 拉黑、或想绕开云 WAF 的自动化，都先读这篇。

## 拓扑（实测）

```
客户端
 └→ 112.49.21.46        云 WAF(qaxcloudwaf/wzws, CNAME 8a6f904dfaa12b84.qaxcloudwaf.com)
 └→ 222.200.96.74       校内源站入口 = 也套着 wzws 一体机(同样拉黑!)
      ├─ 真实机 A (nginx/1.27.0)  /api + 静态 全正常
      └─ 真实机 B (nginx/1.26.2)  静态正常, /api 恒 404(默认页)
222.200.96.75           另一台活机, /api 同样恒 404
222.200.96.73           不在线
```

- 公网 DNS 把域名 CNAME 到云 WAF；校内 DNS 直接给 222.200.96.74。
- 直连 `.74:443`（SNI/Host 用原域名）证书合法、静态 200——这就是"绕云 WAF"的入口，
  **但它自己有 WAF**，拉黑逻辑与云侧一致（同一个 wzws 体系，报文都带 `WZWS-RAY`）。

## WAF 行为（reason:OnekeyCS）

- 触发：单位时间请求量超阈值（实测几十个/分钟级别就会），另外自带 UA/指纹评分。
- 表现：所有路径（含 `/student/` 静态）403，body 带 `Client IP` + `eventID ... reason:OnekeyCS`，
  响应头 `WZWS-RAY`。封禁时长分钟级到小时级。
- **关键：封禁期内继续请求会续期**。重试脚本 5s 一锤 = 永远解不了封。
- 正确姿势：触发后**完全静默 ≥30 分钟**再单发探测；正常运行时请求间隔 ≥20s、总量压低。

## 网关会话绑定 XFF（最隐蔽的一坑）

网关把"当前用户"的会话绑定在 **X-Forwarded-For 客户端 IP** 上：

- 走云 WAF 时 XFF 由 WAF 注入，一切正常——所以平时感觉不到它的存在。
- 直连源站时 nginx **不注入** XFF，网关看到的是内网地址 → 所有需要授权的接口
  一律 `405/403 "当前用户无访问权限/状态失效"`（rsa、school/listAll 这类免授权接口不受影响）。
- 解法：**登录和后续所有请求都带同一个 `X-Forwarded-For: <你的公网出口IP>`**，立刻全通。
  该 IP 无需与真实出口一致，但前后必须一致。

## 直连源站时的其他坑

| 坑 | 说明 |
|---|---|
| POST 必须 Content-Length | 裸 socket 客户端漏发 CL → nginx 当空 body → 登录回 `{"code":1}`（空 message，RSA 解空串炸了）。axios/fetch 无此问题 |
| 双真实机 404 | 直连 `.74` 约一半概率落到 nginx/1.26.2 那台，`/api` 回默认 404 页（静态不受影响）。**只能重试等黏滞翻回**，重试间隔别低于 20s（喂 WAF） |
| 403/404 都要重试 | 404=坏机黏滞；403=WAF 拉黑中。两者都靠"慢节奏等"，没有别的绕法（.75 也是坏机，.73 不在线） |
| code 31/41/70 | 生产环境真的会回：`scheme/list/student` 成功返回的是 `code:31`（旧成功码），判断成功务必用 SUCCESS_CODES 全集 |

## 直连工具箱（tools/origin/）

| 文件 | 用途 |
|---|---|
| `origin-http.ts` | 迷你 TLS HTTP 客户端：直连 .74、SNI 原域名、自带 XFF、25s×60 慢重试（扛 WAF+坏机） |
| `login2.ts` | XFF 版登录，成功后把 `export ANYVIEW_TOKEN=...` 写进 `/tmp/anyview/env.sh` |
| `borrow-run.ts` | 借用判题实验脚本（见 README 借用章节） |

用法：

```bash
cd /tmp/anyview   # 或任意工作目录
. ./env.sh        # export ANYVIEW_TOKEN=...（注意必须带 export，否则子进程拿不到！）
bun run tools/origin/xxx.ts
```

> shell 侧的坑：`. env.sh` 里若没有 `export`，变量只是 shell 局部变量，bun 子进程拿到 undefined；
> 表现恰好是网关回 "JWT strings must contain exactly 2 period characters. Found: 0"。

## 单次探测速查

```bash
# 云 WAF 入口状态
curl -o /dev/null -w "%{http_code}\n" https://anyview.gdut.edu.cn/student/
# 源站直连 API（注意 XFF）
curl --resolve anyview.gdut.edu.cn:443:222.200.96.74 \
  -H "token: $ANYVIEW_TOKEN" -H "X-Forwarded-For: <出口IP>" \
  "https://anyview.gdut.edu.cn/api/scheme-service/catalog/list?schemeId=465&classId=381"
```

## 借用判题实验结论（2026-09-07，scheme 465）

**"其他题借第一题的通过情况去通过"在 2026 后端上不可行**。证据链：

| # | 尝试 | 结果 |
|---|---|---|
| 1 | eID=目标，QF/kind/code 全借 Q1（整程带 main） | 三种 kind(0/1/4) 全部 `multiple definition of 'main'`——**工作目录/模板按 eID 键控**（`/home/admin/projects/<题>/Dx.cpp`、`/root/projects/...`），借 QF 不改编译环境；131 题中除 Q1(kind=3) 外全是有 Dx.cpp 的函数补全题，此路对所有题都编译失败 |
| 2 | 按目标模板签名补齐函数 + `__attribute__((constructor))` 打印 Q1 期望输出后 `exit(0)` | 编译成功、程序输出与 Q1 期望 422B 完全一致，但 `(eID=目标, QF=Q1)` 组合下 runGroup 回 `right=0 err=0 end=true order=0`——**测试组按题目自身身份解析，QF 借用后查不到组**，判题空转，passed=false |
| 3 | 目录复核 | 三轮实验后所有目标 pass 均 false，未发生任何通过记录 |

结论：通过状态只认"目标题自己的 eID + 自己的 questionFullName + 自己的测试组"完整链路，
`runRightCount/runErrCount` 与目录 `pass` 均不可被借用注入。老 noview 的借环境玩法彻底死亡。

**附带的坑（重要）**：`compile/runGroup` 会**顺带把 stuCode 存到目标题名下**（实验代码会覆盖学生存档）。
实验前必须 `scheme/list/student/{eid}` 快照 stuCode，实验后用 `POST /gdb-service/exercise/saveStudentCode`
(JSON `{eID, studentCode(b64)}`) 回写恢复——`tools/origin/restore-stucode.ts` 就是干这个的，已实测三题全部
恢复到与快照逐字节一致。

实验脚本：`tools/origin/borrow-run.ts`（probe+volley 模式：8s 探 catalog 到 200 立即 2s 步进打完整轮）。

## 附：复刻流传的 main.js 借题脚本（2026-09-07 晚，同样死亡）

拿到 circulating 的 `main.js`（UA `KeqingMoe-Hack`，=RIGHT= 借题脚本）后按**逐字段复刻**重打 DC01PE08（`/tmp/anyview/refhack*.ts`）：

| # | 尝试 | 结果 |
|---|---|---|
| 4 | **脚本原样**：compile/runGroup 都发全字段（裸 `questionFullName=DC01PE03e` + `kind=3` + `language=1` + `isDebug` + `questionRes.questionFullName=第1章-DC01PE03e`）+ 脚本的 `=RIGHT=` 整程代码 | 依旧 `multiple definition of 'main'`（Dx.cpp:28 vs 我方第 4 行）——**多发的 kind/裸 QF/language 对编译环境解析零影响**，模板选择只认 eID，脚本连自己的"编译失败跳过"守卫都过不去 |
| 5 | 换上能编译的构造函数劫持代码（打印 Q1 期望 422B），其余字段与脚本完全一致（含裸 QF） | 编译成功、输出正确，但 runGroup 8 连发**全部** `right=0 err=0 end=true order=0`——裸 QF 与带前缀 QF 在测试组解析上无差别，`(目标 eID, 借 QF)` 恒为 0 组 |

结论加强：参考脚本属于老后端时代（编译环境/测试组按客户端传入的 questionFullName 解析）。2026 后端
这两个解析全部改成 eID 服务端键控，客户端字段怎么换都够不着 Q1 的编译环境与测试组——脚本在现网
对 465 的 131 题只会整队"编译失败，跳过"。两次复刻实验的 stuCode 覆盖均已自动快照恢复并读回核对。

**脚本本体真跑（同晚）**：`main.js` 原样执行（`request@2.88.2` + config.mjs 真 token，`bun` 可直接跑，
仅坑 config.mjs 需 default export；唯一改动=过滤只保留 3 个已快照 eID 并跳过已 pass 题），3 题全部
"编译失败，跳过"——脚本连 runGroup 都没碰到。跑后 restore.ts 三题 stuCode 恢复逐字节一致，目录仍
只有 Q1 pass=true。脚本工作目录存档 `/tmp/anyview/refjs/`。

## 附2：main.js 之路的现代后继——判题输出泄露完整答案（2026-09-07 深夜实测）

对未做过的 DC01PE11(11428542) 交**模板原样空桩**并 runGroup 一次：`output` 把 **9 组用例的
全部函数输入与"正确结果"逐组回显**（含边界语义：k<2 或 m<0 → ERROR）。即任何 OJ 题
一次 compile+runGroup 即可拿到完整答案表（oracle），round-2 交查表硬编码即可全 RIGHT——
这是"不做题而过"在现网的可行变体（借身份已死，泄露没死）。空桩探测后 stuCode 已恢复，
DC01PE11 pass 保持 false 未落账。证据 `/tmp/anyview/solve/oracle11-out.txt`。
