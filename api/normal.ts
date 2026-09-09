// OpenAI-compatible 普通 Chat Completions API 客户端。
// 可直接连接 ForgeCode 使用的 GLM Coding API，也兼容其它 OpenAI 协议网关。

import type { ChatMessage } from "../types/chat";

export const DEFAULT_MODEL = "glm-5.3-flash";
export const DEFAULT_BASE_URL = "https://api.z.ai/api/coding/paas/v4";

export interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    stream?: false;
}

export interface ChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: "assistant";
            content: string | null;
            reasoning_content?: string;
        };
        finish_reason: string | null;
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
}

export interface ChatCompletionOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    headers?: Record<string, string>;
}

function env(): Record<string, string | undefined> {
    return process.env as Record<string, string | undefined>;
}

function configuredApiKey(): string {
    const values = env();
    // OPENAI_* 是 ForgeCode 文档使用的变量名；其它变量便于独立使用本客户端。
    const key = [
        values["FORGE_API_KEY"],
        values["FORGE_CODE_API_KEY"],
        values["BIG_MODEL_API_KEY"],
        values["ZAI_CODING_API_KEY"],
        values["ZAI_CODING_CN_API_KEY"],
        values["ZAI_API_KEY"],
        values["OPENAI_API_KEY"],
    ].find((value) => value?.trim());
    if (!key) {
        throw new Error(
            "缺少普通 API Key，请设置 OPENAI_API_KEY、BIG_MODEL_API_KEY 或 ZAI_CODING_API_KEY",
        );
    }
    return key;
}

function configuredBaseUrl(): string {
    const values = env();
    return (
        values["FORGE_API_URL"]?.trim() ||
        values["OPENAI_URL"]?.trim() ||
        values["BIG_MODEL_URL"]?.trim() ||
        values["ZAI_BASE_URL"]?.trim() ||
        DEFAULT_BASE_URL
    );
}

function completionUrl(baseUrl: string): string {
    const base = baseUrl.replace(/\/+$/, "");
    return base.endsWith("/chat/completions")
        ? base
        : `${base}/chat/completions`;
}

function errorMessage(data: unknown, fallback: string): string {
    if (!data || typeof data !== "object") return fallback;
    const obj = data as Record<string, unknown>;
    if (typeof obj["message"] === "string") return obj["message"];
    if (typeof obj["error"] === "string") return obj["error"];
    if (obj["error"] && typeof obj["error"] === "object") {
        const message = (obj["error"] as Record<string, unknown>)["message"];
        if (typeof message === "string") return message;
    }
    return fallback;
}

/** 发送一次非流式 Chat Completions 请求。 */
export async function chatCompletion(
    messages: ChatMessage[],
    opts: ChatCompletionOptions = {},
): Promise<ChatCompletionResponse> {
    const request: ChatCompletionRequest = {
        model: opts.model ?? DEFAULT_MODEL,
        messages,
        temperature: opts.temperature,
        top_p: opts.topP,
        max_tokens: opts.maxTokens,
        stream: false,
    };
    // undefined 字段不应发送，部分兼容网关会严格校验 schema。
    for (const key of Object.keys(request) as Array<keyof ChatCompletionRequest>) {
        if (request[key] === undefined) delete request[key];
    }

    const controller = opts.timeoutMs ? new AbortController() : undefined;
    let timedOut = false;
    const timeout = controller
        ? setTimeout(() => {
              timedOut = true;
              controller.abort();
          }, opts.timeoutMs)
        : undefined;
    if (controller && opts.signal) {
        if (opts.signal.aborted) controller.abort();
        else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
        const response = await fetch(completionUrl(opts.baseUrl ?? configuredBaseUrl()), {
            method: "POST",
            headers: {
                Authorization: `Bearer ${opts.apiKey ?? configuredApiKey()}`,
                "Content-Type": "application/json",
                ...opts.headers,
            },
            body: JSON.stringify(request),
            signal: controller?.signal ?? opts.signal,
        });
        const text = await response.text();
        let data: unknown;
        try {
            data = text ? JSON.parse(text) : undefined;
        } catch {
            throw new Error(
                `普通 API 返回非 JSON (HTTP ${response.status}): ${text.slice(0, 300)}`,
            );
        }
        if (!response.ok) {
            throw new Error(
                `普通 API 请求失败 (HTTP ${response.status}): ${errorMessage(
                    data,
                    text.slice(0, 300),
                )}`,
            );
        }
        if (!data || typeof data !== "object") {
            throw new Error("普通 API 返回为空或格式无效");
        }
        return data as ChatCompletionResponse;
    } catch (error) {
        if (timedOut && error instanceof Error && error.name === "AbortError") {
            throw new Error(`普通 API 请求超时${opts.timeoutMs ? `（>${opts.timeoutMs}ms）` : ""}`);
        }
        throw error;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

export function extractChatText(response: ChatCompletionResponse): string | null {
    return response.choices?.[0]?.message?.content ?? null;
}
