// OpenAI-compatible Chat Completions API 使用的消息类型。
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
