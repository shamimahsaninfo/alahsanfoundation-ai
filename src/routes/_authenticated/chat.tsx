import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mic, MicOff, Send, Plus, Trash2, Volume2, VolumeX, LogOut, Shield, Menu, Square, ImagePlus, X, MessageSquareWarning, ExternalLink } from "lucide-react";
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

type Msg = { role: "user" | "assistant"; content: string; images?: string[] };

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const max = 1600;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = rej;
    img.src = url;
  });
}

function LivePreview({ html }: { html: string }) {
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">লাইভ প্রিভিউ</div>
      <iframe srcDoc={html} sandbox="allow-scripts allow-forms allow-popups" className="h-96 w-full bg-background" title="লাইভ প্রিভিউ" />
    </div>
  );
}
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaint, setComplaint] = useState("");
  const [complaintStatus, setComplaintStatus] = useState("");

  const sendComplaint = async () => {
    if (!complaint.trim()) return;
    setComplaintStatus("পাঠানো হচ্ছে…");
    const { error } = await (supabase as any).from("complaints").insert({ message: complaint.trim().slice(0, 5000), email: user.email });
    if (error) setComplaintStatus("ত্রুটি: " + error.message);
    else { setComplaint(""); setComplaintStatus("✓ আপনার অভিযোগ অ্যাডমিনের কাছে পৌঁছেছে।"); }
  };

  const pickImages = async (files: FileList | null) => {
    if (!files) return;
    const arr = await Promise.all(Array.from(files).slice(0, 4).map(fileToDataUrl));
    setPending((p) => [...p, ...arr].slice(0, 4));
  };

  const loadConvs = async () => {
    const { data } = await supabase.from("conversations").select("id,title").order("updated_at", { ascending: false });
    setConvs(data ?? []);
  };
  useEffect(() => {
    loadConvs();
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (!near && loading) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [msgs, loading]);

  const openConv = async (id: string) => {
    setActive(id);
    setSidebar(false);
    const { data } = await supabase.from("messages").select("role,content").eq("conversation_id", id).order("created_at");
    setMsgs(((data ?? []) as Msg[]).filter((m) => !(m.role === "assistant" && m.content.startsWith("⚠️"))));
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

  const toggleMic = async () => {
    setNotice("");
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return setNotice("এই অ্যাপ/ব্রাউজারে ভয়েস ইনপুট নেই। লিংকটি সরাসরি Google Chrome-এ খুলুন, অথবা কিবোর্ডের মাইক 🎤 বাটন ব্যবহার করুন।");
    if (listening) return recRef.current?.stop();
    try {
      const st = await navigator.mediaDevices?.getUserMedia({ audio: true });
      st?.getTracks().forEach((t) => t.stop());
    } catch {
      return setNotice("মাইক্রোফোনের অনুমতি নেই। ঠিকানা বারের 🔒 আইকন → Site settings → Microphone → Allow করুন (অ্যাপে হলে ফোনের Settings → Apps → অ্যাপ → Permissions → Microphone)।");
    }
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
    rec.onerror = (e: any) => {
      setListening(false);
      if (e?.error !== "no-speech" && e?.error !== "aborted") setNotice(`ভয়েস ত্রুটি: ${e?.error}। Chrome-এ খুলে আবার চেষ্টা করুন।`);
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const send = async () => {
    const imgs = pending;
    const text = input.trim() || (imgs.length ? "এই ছবিটি দেখে বিশ্লেষণ করুন।" : "");
    if (!text || loading) return;
    setInput("");
    setPending([]);
    let convId = active;
    if (!convId) {
      const { data } = await supabase.from("conversations").insert({ title: text.slice(0, 60) }).select("id").single();
      convId = data!.id;
      setActive(convId);
    }
    const history: Msg[] = [...msgs.filter((m) => !m.content.startsWith("⚠️")), { role: "user", content: text, images: imgs }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setLoading(true);
    await supabase.from("messages").insert({ conversation_id: convId, role: "user", content: imgs.length ? `${text}\n\n🖼️ (${imgs.length}টি ছবি সংযুক্ত)` : text });

    let full = "";
    try {
      const { data: s } = await supabase.auth.getSession();
      abortRef.current = new AbortController();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token}` },
        body: JSON.stringify({
          messages: history.slice(-40).map(({ role, content }) => ({ role, content })),
          images: imgs.length ? imgs : undefined,
          ctx: {
            time: new Date().toLocaleString("bn-BD", { dateStyle: "full", timeStyle: "medium" }),
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ua: navigator.userAgent.slice(0, 380),
            screen: `${window.innerWidth}x${window.innerHeight}`,
            lang: navigator.language,
            page: window.location.href.slice(0, 280),
          },
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      let raf = 0;
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
              if (!raf) raf = requestAnimationFrame(() => { raf = 0; setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: full }]); });
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: full }]);
    } catch (e: any) {
      let errText = "";
      if (e?.name !== "AbortError") errText = `⚠️ ${e?.message || "ত্রুটি হয়েছে"}`;
      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: full || errText }]);
    }
    setLoading(false);
    if (full) {
      const htmlCode = full.match(/```html\s*\n([\s\S]*?)```/i)?.[1];
      if (htmlCode && /<html|<body|<!doctype/i.test(htmlCode)) {
        try {
          const { data: s2 } = await supabase.auth.getSession();
          const pr = await fetch("/api/pages", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${s2.session?.access_token}` },
            body: JSON.stringify({ title: text.slice(0, 80), html: htmlCode.trim() }),
          });
          if (pr.ok) {
            const { url } = await pr.json();
            const liveUrl = `${window.location.origin}${url}`;
            full += `\n\n🌐 **লাইভ লিংক:** [${liveUrl}](${liveUrl})`;
            setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: full }]);
          }
        } catch {}
      }
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
    <div className="flex h-[100dvh] overscroll-none bg-background text-foreground">
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
          <button onClick={() => { setComplaintOpen(true); setComplaintStatus(""); }} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground hover:border-primary hover:text-primary">
            <MessageSquareWarning size={16} /> অভিযোগ
          </button>
          <button
            onClick={() => { setVoiceOut(!voiceOut); window.speechSynthesis?.cancel(); }}
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${voiceOut ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
          >
            {voiceOut ? <Volume2 size={16} /> : <VolumeX size={16} />} ভয়েস উত্তর
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain" style={{ overflowAnchor: "none" }}>
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
                    <>
                      {m.images?.length ? <div className="mb-2 flex flex-wrap gap-2">{m.images.map((src, k) => <img key={k} src={src} alt="সংযুক্ত ছবি" className="h-24 rounded-lg object-cover" />)}</div> : null}
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </>
                  ) : m.content ? (
                    <>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">{children}<ExternalLink size={12} /></a> }}>{m.content}</ReactMarkdown>
                      {!(loading && i === msgs.length - 1) && (() => { const h = m.content.match(/```html\s*\n([\s\S]*?)```/i)?.[1]; return h && /<html|<body|<!doctype/i.test(h) ? <LivePreview html={h} /> : null; })()}
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
          {notice && <div className="mx-auto mb-2 flex max-w-3xl items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm"><span className="flex-1">{notice}</span><button onClick={() => setNotice("")} aria-label="বন্ধ"><X size={16} /></button></div>}
          {pending.length > 0 && (
            <div className="mx-auto mb-2 flex max-w-3xl gap-2">
              {pending.map((src, k) => (
                <div key={k} className="relative">
                  <img src={src} alt="নির্বাচিত ছবি" className="h-16 w-16 rounded-lg object-cover" />
                  <button onClick={() => setPending((p) => p.filter((_, j) => j !== k))} className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground" aria-label="সরান"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-card p-2 focus-within:border-primary/60">
            <button onClick={toggleMic} className={`rounded-xl p-3 ${listening ? "animate-pulse bg-destructive text-destructive-foreground" : "text-primary hover:bg-primary/10"}`} aria-label="ভয়েস">
              {listening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { pickImages(e.target.files); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} className="rounded-xl p-3 text-primary hover:bg-primary/10" aria-label="ছবি যোগ করুন"><ImagePlus size={20} /></button>
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
              <button onClick={send} disabled={!input.trim() && !pending.length} className="rounded-xl bg-primary p-3 text-primary-foreground disabled:opacity-40" aria-label="পাঠান"><Send size={20} /></button>
            )}
          </div>
        </div>
      </main>
      {complaintOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={() => setComplaintOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-xl">অ্যাডমিনের কাছে অভিযোগ / পরামর্শ</h3>
              <button onClick={() => setComplaintOpen(false)} aria-label="বন্ধ"><X size={18} /></button>
            </div>
            <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={5} placeholder="আপনার সমস্যা বা পরামর্শ লিখুন…" className="w-full rounded-lg border border-input bg-background p-3 outline-none focus:border-primary" />
            <button onClick={sendComplaint} disabled={!complaint.trim()} className="mt-3 w-full rounded-lg bg-primary py-2 text-primary-foreground disabled:opacity-40">পাঠান</button>
            {complaintStatus && <p className="mt-2 text-sm text-muted-foreground">{complaintStatus}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
