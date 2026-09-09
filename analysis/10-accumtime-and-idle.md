# 10 · accumTime 计时机制与批量挂机（2026-09-07 晚实测）

## 结论

`accumTime`（catalog 接口，**单位秒**，前端 `data-statistics.vue` 用 `secondSwitch()` 渲染）的唯一
来源是 **exam WebSocket 的 401 计时消息对**。HTTP 侧的所有做题接口（init/saveStudentCode/compile/
runGroup/release）**一律不计时**——大量实验后 accumTime 纹丝不动。

## 协议

```
wss://anyview.gdut.edu.cn/api/exam-service/websocket/{token}     # token 直接放 URL path
```

| 消息 | 方向 | 含义 |
|---|---|---|
| `{type:206, content:null, timestamp, token}` | C→S | 连接后先问考试安排（前端行为，回 `212`=无考试） |
| `{type:117, content:null, ...}` | C→S | 心跳，前端每 40s 一次；服务端回显同 type + `currentTime` |
| `{type:401, content:<eID>, ...}` | C→S | **开始给该题计时**（前端语义：关闭题目面板） |
| `{type:401, content:null, ...}` | C→S | **停止计时**（前端语义：打开题目面板） |
| `{type:212, ...}` / `{type:119}` | S→C | 212 考试安排应答；119 = token 失效/单点登录被踢 |
| `{statusType:403}` | S→C | 页面停留过长，要求断开（前端重连后重发 401 续计时） |

每条消息都要带 `timestamp`（毫秒字符串）和 `token` 字段——见前端
`api/protocol/websocket-exam.ts` 的 `sendExamSocket()` 与 `views/Coding.vue` 的
`open()/handleClose()`（"打开面板取消计时/关闭面板开始计时"注释即出处）。

## 实验证据

1. **HTTP 打点零效果**：对 0 秒的 DC01PE18(11428612) 依次 `code/init`(PUT) → saveStudentCode×2
   → compile(编译成功) → 期间挂 150s → release，全程 ~4 分钟；accumTime 0 → 0。
   （此前晚间的判题活动同理：DC06PE23 解题 compile+runGroup+release 后仍 0。）
2. **WS 401 对精确计时**：连 WS → 206 → `401 content=11428612` → 心跳保持 150s →
   `401 content=null` → close；accumTime **0 → 150**，秒级不差。
3. **命令链路 E2E**：`bun index.ts idle --pname DC01PE18 --brush 0.2-0.3` 挂 17s → 167s(+17)。

## 实现与用法

- `api/examSocket.ts` `ExamTimer`：握手轮询（Bun 下 `onopen` 偶发不触发）、206+心跳仿真、119/403 检测。
- `utils/idle.ts` `holdTiming(eid, minutes)`：单题计时挂法（20s 分片睡眠，断线重连续挂剩余时间）；
  `brushIdle()`：批量逐题挂机，随机时长/断点续挂（`data/idle-state-<schemeId>.json`）/逐题复核 accumTime。
- CLI：`bun index.ts idle [--brush 5-10] [--pname x] [--limit n] [--include-passed] [--fresh] [--dry]
  [--course 2 | --scheme 465 --class 381]`。
- `submit` 的刷时长已从旧 brushTime（save+compile 打点，**无效**）换成 `holdTiming`，`--brush/--no-brush`
  语义不变。

## 已通过的题不计时（2026-09-08 深夜批量挂机实测）

`--include-passed` 实测无意义：**服务端对 pass=true 的题不累计 accumTime**。挂 8 分钟的三道已通过题
全部 +0，紧邻的未通过题 +325/+573 秒级精确。所以 idle 默认跳过已通过题是唯一正确行为；
"已通过但 accumTime=0"（如 DC06PE23）无解，属服务端规则。

## 注意

- 计时器是**单活**的：服务端同一时刻只记一题（前端一次只开一题）。逐题串行挂。
- token 有效期约 12h（JWT `iat`/`exp` 差 43200），过夜挂机中途会 119，重新登录后重跑 `idle`
  自动跳过已挂的题。后端重启也会冲掉会话（实测 502→403"当前用户状态失效"，重新登录即恢复）。
- **env.sh 导出坑**：`login2.ts` 写入行必须带 `export ` 前缀；老单元第一轮碰巧从 export 行继承了
  导出标记掩盖了问题，重启后的干净 shell 里无 export = 子进程拿到空 JWT（报"JWT String argument
  cannot be null or empty"）。wrapper 侧已加 `set -a; source …; set +a` 双保险。
- `/etc/hosts` 把域名指到源站 `222.200.96.74` 可绕云 WAF（用户 2026-09-07 晚设置）；WS/HTTPS 同源站，
  证书按域名 SNI 校验正常。
- 挂机只动计时器：不保存/覆盖 stuCode、不触发判题、不改 pass——账号侧无副作用。

## +0 的落账语义与全天对账（2026-09-08 白天补）

批量挂机全天对账（01:33 起的 systemd 单元）：103 题真实到账（秒级精确），wrapper 自愈 3 次
后端重启致 token 失效（08:37/09:42/13:57）。+0 共 5 例：3 例已 pass 题（上节规则）、
**DC02PE17**（11428647，token 有效期内的孤立异常，一轮没涨）、**DS02ES10**（121201，
466 实验题第 4 次实测不计时）。单元于 15:55/16:09 被手动 stop（用户在网页侧使用账号，
16:08 出现 119 互踢）。

据此 idle 的 state 值改为三态语义：`>0`=已到账（跳过）；`=0`=上轮挂了没涨（默认跳过并在
开头列出，`--retry-zero` 重挂）；缺省=未挂。旧版把 +0 也记成正数会让白挂的题被永久跳过，
已有 state 里 +0 的题已手工改 0。
