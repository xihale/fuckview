// SiliconFlow 硅基流动 Batch API 类型定义
// 文档: https://docs.siliconflow.cn/cn/userguide/guides/batch

// ============ 文件上传 ============

export interface SFFile {
    id: string;
    object: string;
    bytes: number;
    createdAt: number;
    filename: string;
    purpose: string;
}

// ============ Batch 任务 ============

export type BatchStatus =
    | "validating"
    | "in_queue"
    | "in_progress"
    | "finalizing"
    | "completed"
    | "expired"
    | "cancelling"
    | "cancelled"
    | "failed";

export interface RequestCounts {
    total: number;
    completed: number;
    failed: number;
}

export interface Batch {
    id: string;
    object: string;
    endpoint: string;
    errors: unknown;
    input_file_id: string;
    completion_window: string;
    status: BatchStatus;
    output_file_id: string | null;
    error_file_id: string | null;
    created_at: number;
    in_progress_at: number | null;
    expires_at: number | null;
    finalizing_at: number | null;
    completed_at: number | null;
    failed_at: number | null;
    expired_at: number | null;
    cancelling_at: number | null;
    request_counts: RequestCounts;
    metadata: Record<string, string> | null;
    model?: string;
}

// ============ 输入 jsonl 行 ============

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface BatchInputBody {
    model: string;
    messages: ChatMessage[];
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    stream?: boolean;
}

export interface BatchInputLine {
    custom_id: string;
    method: "POST";
    url: "/v1/chat/completions";
    body: BatchInputBody;
}

// ============ 输出 jsonl 行 ============

// 实测返回结构: { id, custom_id, response: { body: ChatCompletion }, error, trace_id }
// (与 OpenAI 文档的 response.choices 不同, 硅基流动把完整响应包在 response.body 里)
export interface Choice {
    index: number;
    message: {
        role: "assistant";
        content: string;
        reasoning_content?: string;
    };
    finish_reason: string;
}

export interface Usage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface BatchOutputResponseBody {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Choice[];
    usage: Usage;
}

export interface BatchOutputLine {
    id: string;
    custom_id: string;
    response: {
        body: BatchOutputResponseBody | null;
    } | null;
    error: {
        code: string;
        message: string;
    } | null;
    trace_id?: string;
}
