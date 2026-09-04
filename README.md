# fuckview

## 声明

AnyView 并非很垃圾，其实在我看来还是挺不错的。

如果你根本就不会做里面的题目还来找这些邪门歪道，那我得 FUCK YOU 了！

使用这个脚本之前，请自己仔细想想！

## 工作流

```
┌─────────┐   batch api    ┌──────────────┐   轮询下载    ┌─────────┐
│ write   │ ─────────────► │ 硅基流动      │ ───────────► │ gen/    │
│ 批量生成 │                │ (半价离线)    │              │ 落盘     │
└─────────┘                └──────────────┘              └────┬────┘
                                                              │
┌─────────┐   刷时长(8~18min)   ┌─────────┐   通过            ▼
│ submit  │ ──────────────────► │ 编译/运行 │ ──────────► data/Chapter*/
│ 逐题提交 │ ◄────────────────── │ 失败信息  │
└─────────┘                     └─────────┘
      │                              │
      ▼                              ▼
┌─────────┐   带错误信息重新生成   ┌─────────┐
│   fix   │ ──────────────────► │ batch   │  (最多 3 次)
└─────────┘                     └─────────┘
```

## 使用

前置: `.envrc` 里配置 `SILIKEY`（硅基流动 key）和 `api/config.ts` 里配置 AnyView 的 `token`/`cookie`（F12 抓包获取，隔一段时间会过期）。

```bash
bun install

# 0. 全自动: write -> submit -> fix/submit 循环直到结束（挂后台跑）
bun index.ts all [--brush 8-18] [--max-attempts 3]

# 1. 批量生成未通过题目的答案（走硅基流动 batch API, 半价, 结果落盘到 gen/）
bun index.ts write [--model deepseek-ai/DeepSeek-V3.2] [--limit 20] [--dry]

# 2. 逐题提交: 先刷时长(默认每题随机 8~18 分钟, 模拟做题行为), 再编译+运行
bun index.ts submit [--brush 8-18] [--pname CP03EX010] [--limit 5] [--no-brush]

# 3. 失败的题目带错误信息重新生成, 然后再 submit（默认最多 3 次）
bun index.ts fix [--max-attempts 3] [--pname xxx]

# 辅助
bun index.ts status          # 进度统计
bun index.ts recover <id>    # 恢复中断的 batch
bun index.ts list-batches    # 历史 batch
bun index.ts legacy          # 老流程: 直接用 data/ 现成答案逐题提交
```

注意: `submit` 刷时长是真实等待（默认每题 8~18 分钟），挂后台跑。`submit` 只提交 pending 的答案；failed 的先 `fix` 重新生成再提交，避免浪费刷时长的等待。

## 目录

- `api/` AnyView 接口封装 + 硅基流动 batch 客户端
- `utils/` write(生成)/submit(提交)/fix(修复) 流程、刷时长、prompt、本地存储
- `gen/` 生成的答案库（gitignore）：`answers/` 每题状态、`attempts/` 历史尝试、`batches/` 任务记录
- `data/` 通过的答案（submodule，提交通过后自动写入 `data/ChapterX/xxx.c`）

## Reference

[noview](https://github.com/KeqingMoe/noview)
[bun.js](https://bun.com/)
