"use client";

import * as React from "react";
import { Bot, Loader2, MessageCircle, Paperclip, RotateCcw, SendHorizontal, X } from "lucide-react";

import { useLanguage } from "@/components/shell/language-provider";
import { cn } from "@/lib/utils";

/**
 * Floating OnRoad AI chat. The bot behind it is the WhatsApp bot: every
 * message goes to /api/onroad-ai/chat, which runs the same router and returns
 * what the bot would have sent over WhatsApp.
 */

interface ChatButton {
  id: string;
  title: string;
}

interface ChatMessage {
  id: string;
  from: "me" | "bot";
  text: string;
  buttons: ChatButton[];
  fileName?: string;
  error?: boolean;
}

const STORAGE_KEY = "onroad-ai-webchat-v1";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_KEPT = 80;

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter += 1)}`;

function readStored(): ChatMessage[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ChatMessage[]).slice(-MAX_KEPT) : [];
  } catch {
    return [];
  }
}

function writeStored(messages: ChatMessage[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_KEPT)));
  } catch {
    // Private mode or full storage: the chat still works, it just forgets on reload.
  }
}

/** WhatsApp formatting (*bold*, _italic_, ~strike~) rendered as elements, never as HTML. */
function renderInline(line: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const pattern = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = pattern.exec(line))) {
    if (match.index > last) out.push(line.slice(last, match.index));
    const token = match[0];
    const inner = token.slice(1, -1);
    const k = `${key}-${n++}`;
    if (token.startsWith("*")) out.push(<strong key={k} className="font-semibold">{inner}</strong>);
    else if (token.startsWith("_")) out.push(<em key={k}>{inner}</em>);
    else out.push(<s key={k}>{inner}</s>);
    last = match.index + token.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <React.Fragment key={index}>
          {renderInline(line, String(index))}
          {index < lines.length - 1 ? <br /> : null}
        </React.Fragment>
      ))}
    </>
  );
}

export function OnroadAiChatWidget() {
  const { dictionary } = useLanguage();
  const copy = dictionary.onroadAiChat;
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [pending, setPending] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const loaded = React.useRef(false);
  const scroller = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLTextAreaElement>(null);
  const picker = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setMessages(readStored());
    loaded.current = true;
  }, []);

  React.useEffect(() => {
    if (loaded.current) writeStored(messages);
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending, open]);

  React.useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = React.useCallback(
    async (payload: { text?: string; replyId?: string; file?: File | null }) => {
      if (pending) return;
      const text = payload.text?.trim() ?? "";
      if (!text && !payload.replyId && !payload.file) return;
      setNotice(null);
      setMessages((current) => [
        ...current,
        { id: nextId(), from: "me", text, buttons: [], fileName: payload.file?.name },
      ]);
      setDraft("");
      setFile(null);
      setPending(true);
      try {
        const form = new FormData();
        if (text) form.set("text", text);
        if (payload.replyId) form.set("replyId", payload.replyId);
        if (payload.file) form.set("file", payload.file);
        const response = await fetch("/api/onroad-ai/chat", { method: "POST", body: form });
        const data = (await response.json().catch(() => null)) as
          | { replies?: { text: string; buttons: ChatButton[] }[]; error?: string }
          | null;
        if (!response.ok || !data?.replies) throw new Error(data?.error ?? copy.error);
        const replies = data.replies;
        setMessages((current) => [
          ...current,
          ...replies.map((reply) => ({ id: nextId(), from: "bot" as const, text: reply.text, buttons: reply.buttons ?? [] })),
        ]);
      } catch (error) {
        setMessages((current) => [
          ...current,
          { id: nextId(), from: "bot", text: error instanceof Error && error.message ? error.message : copy.error, buttons: [], error: true },
        ]);
      } finally {
        setPending(false);
        input.current?.focus();
      }
    },
    [pending, copy.error],
  );

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!chosen) return;
    if (!FILE_TYPES.includes(chosen.type)) return setNotice(copy.fileType);
    if (chosen.size > MAX_FILE_BYTES) return setNotice(copy.fileTooLarge);
    setNotice(null);
    setFile(chosen);
  }

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    void send({ text: draft, file });
  }

  const lastBotIndex = messages.reduce((found, message, index) => (message.from === "bot" ? index : found), -1);

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={copy.open}
          title={copy.open}
          className="fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <MessageCircle className="h-6 w-6" aria-hidden />
        </button>
      ) : null}

      {open ? (
        <section
          role="dialog"
          aria-label={copy.title}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-hidden rounded-t-xl border border-border bg-card text-card-foreground shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:max-h-[calc(100dvh-2.5rem)] sm:w-[400px] sm:rounded-xl"
        >
          <header className="flex items-center gap-3 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
              <Bot className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{copy.title}</p>
              <p className="truncate text-xs opacity-80">{copy.subtitle}</p>
            </div>
            {messages.length > 0 ? (
              <button
                type="button"
                onClick={() => setMessages([])}
                aria-label={copy.clear}
                title={copy.clear}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-primary-foreground/15"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={copy.close}
              title={copy.close}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-primary-foreground/15"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto bg-muted/40 px-3 py-4" aria-live="polite">
            {messages.length === 0 ? (
              <p className="mx-auto mt-6 max-w-[280px] text-center text-sm text-muted-foreground">{copy.empty}</p>
            ) : null}
            {messages.map((message, index) => (
              <div key={message.id} className={cn("flex flex-col", message.from === "me" ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-relaxed shadow-sm",
                    message.from === "me"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : message.error
                        ? "rounded-bl-sm border border-destructive/40 bg-card text-destructive"
                        : "rounded-bl-sm bg-card",
                  )}
                >
                  {message.fileName ? (
                    <p className={cn("flex items-center gap-1 text-xs", message.text ? "mb-1 opacity-80" : "")}>
                      <Paperclip className="h-3 w-3" aria-hidden /> {message.fileName}
                    </p>
                  ) : null}
                  {message.from === "me" && !message.text && !message.fileName ? null : <FormattedText text={message.text} />}
                </div>
                {message.buttons.length > 0 ? (
                  <div className="mt-1.5 flex max-w-[85%] flex-wrap gap-1.5">
                    {message.buttons.map((button) => (
                      <button
                        key={button.id}
                        type="button"
                        disabled={pending || index !== lastBotIndex}
                        onClick={() => void send({ text: button.title, replyId: button.id })}
                        className="rounded-full border border-primary/40 bg-card px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                      >
                        {button.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {pending ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {copy.thinking}
              </div>
            ) : null}
          </div>

          <form onSubmit={submit} className="border-t border-border bg-card p-2">
            {notice ? <p className="px-1 pb-1.5 text-xs text-destructive">{notice}</p> : null}
            {file ? (
              <div className="mb-1.5 flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button type="button" onClick={() => setFile(null)} aria-label={copy.removeFile} className="rounded p-0.5 hover:bg-background">
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-1.5">
              <input ref={picker} type="file" accept={FILE_TYPES.join(",")} className="hidden" onChange={pickFile} />
              <button
                type="button"
                onClick={() => picker.current?.click()}
                disabled={pending}
                aria-label={copy.attach}
                title={copy.attach}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                <Paperclip className="h-5 w-5" aria-hidden />
              </button>
              <textarea
                ref={input}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder={copy.placeholder}
                className="max-h-32 min-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
              />
              <button
                type="submit"
                disabled={pending || (!draft.trim() && !file)}
                aria-label={copy.send}
                title={copy.send}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SendHorizontal className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
