import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mic, MicOff, Send, Plus, Trash2, Volume2, VolumeX, LogOut, Shield, Menu, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { isAdminEmail } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "কথোপকথন — আল আহসান এআই" },
      { name: "description", content: "আল আহসান এআই-এর সাথে লিখে বা কথা বলে কথোপকথন করুন।" },
      { property: "og:title", content: "কথোপকথন — আল আহসান এআই" },
      { property: "og:description", content: "শক্তিশালী বাংলা এআই সহকারীর সাথে চ্যাট।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

type Msg = { role: "user" | "assistant"; content: string };
type Conv = { id: string; title: string };

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[#*`_>|-]/g, " ").slice(0, 4000);
  const u = new SpeechSynthesisUtterance(clean);
  const bn = /[\u0980-\u09FF]/.test(clean);
  u.lang = bn ? "bn-BD" : "en-US";
  const v = window.speechSynthesis.getVoices().find((x) => x.lang.startsWith(bn ? "bn" : "en"));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

function ChatPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const admin = isAdminEmail(user.email);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceOut, setVoiceOut] = useState(false);
  const [listening, setListening] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const recRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadConvs = async () => {
    const { data } = await supabase.from("conversations").select("id,title").order("updated_at", { ascending: false });
    setConvs(data ?? []);
  };
  useEffect(() => {
    loadConvs();
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const openConv = async (id: string) => {
    setActive(id);
    setSidebar(false);
    const { data } = await supabase.from("messages").select("role,content").eq("conversation_id", id).order("created_at");
    setMsgs((data ?? []) as Msg[]);
  };

  const newChat = () => {
    setActive(null);
    setMsgs([]);
    setSidebar(false);
  };

  const delConv = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    if (active === id) newChat();
    loadConvs();
  };

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return alert("আপনার ব্রাউজারে ভয়েস ইনপুট সাপোর্ট নেই। Chrome ব্যবহার করুন।");
    if (listening) return recRef.current?.stop();
    const rec = new SR();
    rec.lang = "bn-BD";
    rec.interimResults = true;
    rec.continuous = false;
    const base = input;
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInput((base ? base + " " : "") + t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    let convId = active;
    if (!convId) {
      const { data } = await supabase.from("conversations").insert({ title: text.slice(0, 60) }).select("id").single();
      convId = data!.id;
      setActive(convId);
    }
    const history: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setLoading(true);
    await supabase.from("messages").insert({ conversation_id: convId, role: "user", content: text });

    let full = "";
    try {
      const { data: s } = await supabase.auth.getSession();
      abortRef.current = new AbortController();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token}` },
        body: JSON.stringify({ messages: history.slice(-40) }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          const d = line.slice(5).trim();
          if (d === "[DONE]") continue;
          try {
            const delta = JSON.parse(d).choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: full }]);
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") full = full || `⚠️ ${e?.message || "ত্রুটি হয়েছে"}`;
      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: full }]);
    }
    setLoading(false);
    if (full) {
      await supabase.from("messages").insert({ conversation_id: convId, role: "assistant", content: full });
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      if (voiceOut) speak(full);
    }
    loadConvs();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside
        className={`${sidebar ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-72 flex-col border-r border-border bg-sidebar md:static md:flex`}
      >
        <div className="flex items-center gap-3 p-4">
          <Logo size={32} />
          <span className="font-display text-xl">আল আহসান</span>
        </div>
        <button onClick={newChat} className="mx-3 flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-primary hover:bg-primary/10">
          <Plus size={18} /> নতুন কথোপকথন
        </button>
        <div className="mt-3 flex-1 space-y-1 overflow-y-auto px-2">
          {convs.map((c) => (
            <div key={c.id} className={`group flex items-center rounded-lg px-3 py-2 text-sm ${active === c.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"}`}>
              <button onClick={() => openConv(c.id)} className="flex-1 truncate text-left">{c.title}</button>
              <button onClick={() => delConv(c.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" aria-label="মুছুন">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-1 border-t border-border p-3 text-sm">
          {admin && (
            <Link to="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-primary hover:bg-primary/10">
              <Shield size={16} /> অ্যাডমিন প্যানেল
            </Link>
          )}
          <div className="truncate px-3 text-xs text-muted-foreground">{user.email}</div>
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-sidebar-accent">
            <LogOut size={16} /> বের হোন
          </button>
        </div>
      </aside>

      <main className="pattern-bg flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <button className="md:hidden" onClick={() => setSidebar(!sidebar)} aria-label="মেনু"><Menu /></button>
          <span className="font-display text-lg text-primary">আল আহসান এআই</span>
          <button
            onClick={() => { setVoiceOut(!voiceOut); window.speechSynthesis?.cancel(); }}
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${voiceOut ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
          >
            {voiceOut ? <Volume2 size={16} /> : <VolumeX size={16} />} ভয়েস উত্তর
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {msgs.length === 0 && (
              <div className="mt-20 flex flex-col items-center text-center">
                <Logo size={64} />
                <h2 className="mt-4 font-display text-3xl">আসসালামু আলাইকুম</h2>
                <p className="mt-2 text-muted-foreground">আজ আমি কীভাবে সাহায্য করতে পারি? লিখুন অথবা মাইক চেপে বলুন।</p>
                <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                  {["সূরা ফাতিহার তাফসীর সংক্ষেপে বলুন", "একটি ব্যবসায়িক পরিকল্পনা লিখে দিন", "এই ইংরেজি বাক্যটি বাংলায় অনুবাদ করুন", "Python দিয়ে একটি ক্যালকুলেটর বানান"].map((p) => (
                    <button key={p} onClick={() => setInput(p)} className="rounded-xl border border-border bg-card/60 p-4 text-left text-sm hover:border-primary/60">{p}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`mb-5 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={m.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground" : "prose-ai max-w-full flex-1"}>
                  {m.role === "user" ? (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  ) : m.content ? (
                    <>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      <button onClick={() => speak(m.content)} className="mt-1 text-muted-foreground hover:text-primary" aria-label="শুনুন"><Volume2 size={15} /></button>
                    </>
                  ) : (
                    <span className="typing"><i /><i /><i /></span>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t border-border/60 p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-card p-2 focus-within:border-primary/60">
            <button onClick={toggleMic} className={`rounded-xl p-3 ${listening ? "animate-pulse bg-destructive text-destructive-foreground" : "text-primary hover:bg-primary/10"}`} aria-label="ভয়েস">
              {listening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder={listening ? "শুনছি…" : "আপনার প্রশ্ন লিখুন…"}
              className="max-h-48 flex-1 resize-none bg-transparent px-2 py-3 outline-none placeholder:text-muted-foreground"
            />
            {loading ? (
              <button onClick={() => abortRef.current?.abort()} className="rounded-xl bg-secondary p-3" aria-label="থামান"><Square size={20} /></button>
            ) : (
              <button onClick={send} disabled={!input.trim()} className="rounded-xl bg-primary p-3 text-primary-foreground disabled:opacity-40" aria-label="পাঠান"><Send size={20} /></button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
