// SiliconFlow 硅基流动 Batch API 客户端
// 流程: 上传 jsonl -> 创建 batch -> 轮询状态 -> 下载结果
// 文档: https://docs.siliconflow.cn/cn/userguide/guides/batch

import type {
    Batch,
    BatchInputLine,
    BatchOutputLine,
    SFFile,
} from "../types/siliconflow";

const BASE_URL = "https://api.siliconflow.cn/v1";

// 默认模型: DeepSeek-V3.2(便宜且支持 batch), 可通过参数覆盖
export const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V3.2";

function apiKey(): string {
    const env = process.env as Record<string, string | undefined>;
    const key = env["SILIKEY"] || env["SILICONFLOW_API_KEY"];
    if (!key) {
        throw new Error(
            "缺少硅基流动 API Key，请在 .envrc 中设置 SILIKEY（或导出 SILICONFLOW_API_KEY）",
        );
    }
    return key;
}

async function sfFetch<T>(
    path: string,
    init?: RequestInit & { json?: unknown },
): Promise<T> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey()}`,
        ...((init?.headers as Record<string, string>) ?? {}),
    };
    let body = init?.body;
    if (init?.json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(init.json);
    }
    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers, body });
    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `SiliconFlow ${path} 返回非 JSON (HTTP ${res.status}): ${text.slice(0, 300)}`,
        );
    }
    if (!res.ok) {
        const dataObj = data as Record<string, unknown>;
        const msg =
            (dataObj["message"] as string | undefined) ??
            (
                dataObj["error"] as { message?: string } | undefined
            )?.message ??
            text.slice(0, 300);
        throw new Error(`SiliconFlow ${path} 失败 (HTTP ${res.status}): ${msg}`);
    }
    return data as T;
}

// ============ 1. 上传输入文件 ============

export async function uploadBatchFile(lines: BatchInputLine[]): Promise<string> {
    if (lines.length > 5000) {
        throw new Error(`输入文件行数 ${lines.length} 超过 5000 行上限`);
    }
    const content = lines.map((l) => JSON.stringify(l)).join("\n");
    const boundary = `----fuckview${Date.now().toString(16)}`;
    const parts = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="purpose"',
        "",
        "batch",
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="batch_input.jsonl"',
        "Content-Type: application/jsonl",
        "",
        content,
        `--${boundary}--`,
        "",
    ];
    const formData = parts.join("\r\n");
    const file = await sfFetch<{ data?: SFFile[] } & Partial<SFFile>>(
        "/files",
        {
            method: "POST",
            headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
            body: formData,
        },
    );
    // 实测返回结构: { code, message, status, data: SFFile } (data 是对象不是数组)
    const payload = file as Partial<SFFile> & { data?: Partial<SFFile> };
    const id = payload.id ?? payload.data?.id;
    if (!id) throw new Error(`上传文件未返回 id: ${JSON.stringify(file).slice(0, 300)}`);
    return id;
}

// ============ 2. 创建 batch 任务 ============

export async function createBatch(
    inputFileId: string,
    opts?: { model?: string; description?: string },
): Promise<Batch> {
    return sfFetch<Batch>("/batches", {
        method: "POST",
        json: {
            input_file_id: inputFileId,
            endpoint: "/v1/chat/completions",
            completion_window: "24h",
            metadata: { description: opts?.description ?? "fuckview" },
            // 指定实际使用的模型（文件内各行 model 可以不统一）
            replace: { model: opts?.model ?? DEFAULT_MODEL },
        },
    });
}

// ============ 3. 查询 batch 状态 ============

export async function retrieveBatch(batchId: string): Promise<Batch> {
    return sfFetch<Batch>(`/batches/${batchId}`, { method: "GET" });
}

export async function cancelBatch(batchId: string): Promise<Batch> {
    return sfFetch<Batch>(`/batches/${batchId}/cancel`, { method: "POST" });
}

// 轮询直到 batch 完成（completed / failed / expired / cancelled）
export async function waitBatch(
    batchId: string,
    opts?: { pollIntervalSec?: number; maxWaitSec?: number; onProgress?: (b: Batch) => void },
): Promise<Batch> {
    const interval = opts?.pollIntervalSec ?? 30;
    const maxWait = opts?.maxWaitSec ?? 24 * 3600;
    const start = Date.now();
    for (;;) {
        const batch = await retrieveBatch(batchId);
        opts?.onProgress?.(batch);
        const done = ["completed", "failed", "expired", "cancelled"].includes(
            batch.status,
        );
        if (done) return batch;
        if ((Date.now() - start) / 1000 > maxWait) {
            throw new Error(`batch ${batchId} 等待超时（>${maxWait}s），当前状态 ${batch.status}`);
        }
        await Bun.sleep(interval * 1000);
    }
}

// ============ 4. 下载结果 ============

async function downloadFileContent(fileIdOrUrl: string): Promise<string> {
    // 实测 output_file_id 是预签名 URL, 可直接 GET; 兼容纯文件 id 两种形式
    const url = fileIdOrUrl.startsWith("http")
        ? fileIdOrUrl
        : `${BASE_URL}/files/${fileIdOrUrl}/content`;
    const res = await fetch(url, {
        headers: fileIdOrUrl.startsWith("http")
            ? {}
            : { Authorization: `Bearer ${apiKey()}` },
    });
    if (!res.ok) {
        throw new Error(`下载文件 ${fileIdOrUrl} 失败: HTTP ${res.status}`);
    }
    return res.text();
}

// 下载 batch 的成功结果 + 错误行，合并返回
export async function downloadBatchResults(
    batch: Batch,
): Promise<{ outputs: BatchOutputLine[]; errors: BatchOutputLine[] }> {
    const outputs: BatchOutputLine[] = [];
    const errors: BatchOutputLine[] = [];
    if (batch.output_file_id) {
        const text = await downloadFileContent(batch.output_file_id);
        for (const line of text.split("\n")) {
            if (!line.trim()) continue;
            outputs.push(JSON.parse(line) as BatchOutputLine);
        }
    }
    if (batch.error_file_id) {
        const text = await downloadFileContent(batch.error_file_id);
        for (const line of text.split("\n")) {
            if (!line.trim()) continue;
            errors.push(JSON.parse(line) as BatchOutputLine);
        }
    }
    return { outputs, errors };
}

// 一条龙: 上传 -> 创建 -> 等待 -> 下载
export async function runBatch(
    lines: BatchInputLine[],
    opts?: {
        model?: string;
        description?: string;
        pollIntervalSec?: number;
        onProgress?: (b: Batch) => void;
    },
): Promise<{ outputs: BatchOutputLine[]; errors: BatchOutputLine[]; batch: Batch }> {
    const fileId = await uploadBatchFile(lines);
    const batch = await createBatch(fileId, { model: opts?.model, description: opts?.description });
    const final = await waitBatch(batch.id, {
        pollIntervalSec: opts?.pollIntervalSec,
        onProgress: opts?.onProgress,
    });
    const results = await downloadBatchResults(final);
    return { ...results, batch: final };
}

// 从输出行提取回答文本
export function extractOutputText(line: BatchOutputLine): string | null {
    if (line.error || !line.response?.body) return null;
    return line.response.body.choices?.[0]?.message?.content ?? null;
}
