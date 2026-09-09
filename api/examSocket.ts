// 考试/做题 WebSocket (websocket-exam.ts 同款协议)
// 服务端按 401 消息对累计题目做题时长 accumTime:
//   {type:401, content:eID}  关闭题目面板 → 开始给该题计时
//   {type:401, content:null} 打开题目面板 → 停止计时
//   {type:117} 心跳(前端每 40s 一次, 服务端回显 currentTime)
//   {type:206} 连接后先问考试安排(前端行为, 服务端回 212=无考试)
// 服务端下发 statusType:403 = 页面停留过长, 前端做法是断开重连后重发 401;
// type:119 = 单点登录被踢/token 失效。
import { config } from "./config.ts";

const WS_BASE = "wss://anyview.gdut.edu.cn/api/exam-service/websocket";

export class ExamTimer {
    private ws: WebSocket | null = null;
    private hb: ReturnType<typeof setInterval> | null = null;
    private kicked = false;

    private send(type: number, content: unknown): void {
        this.ws?.send(
            JSON.stringify({
                type,
                content,
                timestamp: String(Date.now()),
                token: config.token,
            }),
        );
    }

    // 建连并等握手完成(Bun 下 onopen 偶发不触发, 轮询 readyState 兜底)
    async connect(): Promise<void> {
        if (this.ws && this.ws.readyState === 1) return;
        this.ws = new WebSocket(`${WS_BASE}/${config.token}`);
        this.ws.onmessage = (e) => {
            try {
                const d = JSON.parse(String(e.data)) as {
                    type?: number;
                    statusType?: number;
                };
                if (d.type === 119) {
                    this.kicked = true;
                    console.error("  ⚠ WS type=119: token 失效或账号被他处登录顶掉");
                } else if (d.statusType === 403) {
                    console.log("  ⚠ 服务端提示停留过长(statusType=403), 将重连续挂");
                }
            } catch {
                /* 忽略非 JSON 帧 */
            }
        };
        for (let i = 0; i < 100; i++) {
            if (this.ws.readyState === 1) break;
            if (this.ws.readyState >= 2) throw new Error("WS 握手失败");
            await Bun.sleep(100);
        }
        if (this.ws.readyState !== 1) throw new Error("WS 握手超时");
        this.send(206, null);
        this.hb = setInterval(() => {
            if (this.ws?.readyState === 1) this.send(117, null);
        }, 40000);
    }

    get isOpen(): boolean {
        return this.ws?.readyState === 1;
    }

    get isKicked(): boolean {
        return this.kicked;
    }

    startTiming(eid: number): void {
        this.send(401, eid);
    }

    stopTiming(): void {
        this.send(401, null);
    }

    close(): void {
        if (this.hb) clearInterval(this.hb);
        this.hb = null;
        try {
            this.ws?.close();
        } catch {
            /* 已断 */
        }
        this.ws = null;
    }
}
