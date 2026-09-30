import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/lib/admin";
import { GOOGLE_MODELS, LOVABLE_MODELS, OPENAI_MODELS, type Provider } from "@/lib/models";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "অ্যাডমিন প্যানেল — আল আহসান এআই" },
      { name: "description", content: "আল আহসান এআই-এর নির্দেশনা, মডেল ও API কী নিয়ন্ত্রণ।" },
      { property: "og:title", content: "অ্যাডমিন প্যানেল — আল আহসান এআই" },
      { property: "og:description", content: "এআই নির্দেশনা ও মডেল সেটিংস।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = Route.useRouteContext();
  const [note, setNote] = useState("");
  const [provider, setProvider] = useState<Provider>("lovable");
  const [model, setModel] = useState("");
  const [gKey, setGKey] = useState("");
  const [oKey, setOKey] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    supabase.from("ai_settings").select("*").eq("id", 1).maybeSingle().then(({ data }) => {
      if (!data) return;
      setNote(data.admin_note);
      setProvider(data.provider as Provider);
      setModel(data.model);
      setGKey(data.google_api_key ?? "");
      setOKey(data.openai_api_key ?? "");
    });
  }, []);

  if (!isAdminEmail(user.email)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-center">
        <div>
          <h1 className="font-display text-3xl">প্রবেশাধিকার নেই</h1>
          <Link to="/chat" className="mt-4 inline-block text-primary">চ্যাটে ফিরে যান</Link>
        </div>
      </div>
    );
  }

  const models = provider === "google" ? GOOGLE_MODELS : provider === "openai" ? OPENAI_MODELS : LOVABLE_MODELS;

  const changeProvider = (p: Provider) => {
    setProvider(p);
    setModel((p === "google" ? GOOGLE_MODELS : p === "openai" ? OPENAI_MODELS : LOVABLE_MODELS)[0]?.id ?? "");
  };

  const save = async () => {
    setStatus("সংরক্ষণ হচ্ছে…");
    if (provider === "google" && !gKey.trim()) return setStatus("Google মোডের জন্য Gemini API কী দিন।");
    if (provider === "openai" && !oKey.trim()) return setStatus("OpenAI মোডের জন্য API কী দিন।");
    const { error } = await supabase
      .from("ai_settings")
      .update({
        admin_note: note,
        provider,
        model,
        google_api_key: gKey.trim() || null,
        openai_api_key: oKey.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setStatus(error ? `ত্রুটি: ${error.message}` : "✓ সংরক্ষিত হয়েছে। এআই এখন নতুন সেটিংস অনুযায়ী কাজ করবে।");
  };

  const card = "rounded-2xl border border-border bg-card/80 p-6";
  const input = "w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:border-primary";

  return (
    <div className="pattern-bg min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <h1 className="font-display text-3xl">অ্যাডমিন প্যানেল</h1>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <Link to="/chat" className="flex items-center gap-1 text-primary"><ArrowLeft size={16} /> চ্যাট</Link>
        </div>

        <section className={card}>
          <h2 className="font-display text-xl text-primary">নোট বাক্স — এআই-এর নির্দেশনা</h2>
          <p className="mt-1 text-sm text-muted-foreground">এখানে যা লিখবেন, আল আহসান এআই সর্বোচ্চ অগ্রাধিকার দিয়ে সেই অনুযায়ী কাজ করবে।</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={10} className={`${input} mt-4 font-body`}
            placeholder="যেমন: সবসময় সংক্ষেপে উত্তর দেবে। প্রতিটি উত্তরের শেষে 'আল্লাহ ভালো জানেন' লিখবে…" />
        </section>

        <section className={`${card} mt-6`}>
          <h2 className="font-display text-xl text-primary">এআই মোড ও মডেল</h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {([["lovable", "বিল্ট-ইন (কী লাগবে না)"], ["google", "Google Gemini"], ["openai", "OpenAI"]] as const).map(([p, l]) => (
              <button key={p} onClick={() => changeProvider(p)}
                className={`rounded-lg border px-3 py-3 text-sm ${provider === p ? "border-primary bg-primary/15 text-primary" : "border-border"}`}>{l}</button>
            ))}
          </div>
          <label className="mt-4 block text-sm text-muted-foreground">মডেল</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} className={`${input} mt-1`}>
            {!models.some((m) => m.id === model) && model && <option value={model}>{model}</option>}
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <label className="mt-2 block text-xs text-muted-foreground">অথবা নিজে মডেল আইডি লিখুন</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} className={`${input} mt-1 text-sm`} />
        </section>

        <section className={`${card} mt-6`}>
          <h2 className="font-display text-xl text-primary">API কী</h2>
          <label className="mt-4 block text-sm text-muted-foreground">Google Gemini API কী</label>
          <input type="password" value={gKey} onChange={(e) => setGKey(e.target.value)} className={`${input} mt-1`} placeholder="AIza…" />
          <label className="mt-4 block text-sm text-muted-foreground">OpenAI API কী</label>
          <input type="password" value={oKey} onChange={(e) => setOKey(e.target.value)} className={`${input} mt-1`} placeholder="sk-…" />
        </section>

        <div className="mt-6 flex items-center gap-4">
          <button onClick={save} className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">
            <Save size={18} /> সংরক্ষণ করুন
          </button>
          <span className="text-sm text-muted-foreground">{status}</span>
        </div>
      </div>
    </div>
  );
}
