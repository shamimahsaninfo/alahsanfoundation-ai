import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "আল আহসান এআই — Al Ahsan AI" },
      { name: "description", content: "মুহিউস সুন্নাহ ফাউন্ডেশন বাংলাদেশের শক্তিশালী বাংলা এআই সহকারী, ভয়েস সহ।" },
      { property: "og:title", content: "আল আহসান এআই — Al Ahsan AI" },
      { property: "og:description", content: "শক্তিশালী বাংলা এআই সহকারী — লিখুন বা কথা বলুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat" });
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "SIGNED_IN" && s) navigate({ to: "/chat" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const signIn = async () => {
    setBusy(true);
    setErr("");
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) {
      setErr("লগইন ব্যর্থ হয়েছে, আবার চেষ্টা করুন।");
      setBusy(false);
      return;
    }
    if (r.redirected) return;
    navigate({ to: "/chat" });
  };

  return (
    <main className="pattern-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="glow" />
      <div className="relative z-10 flex max-w-2xl flex-col items-center">
        <Logo size={88} />
        <p className="mt-6 font-display text-lg tracking-[0.3em] text-primary">بِسْمِ اللّٰهِ</p>
        <h1 className="mt-4 font-display text-5xl leading-tight text-foreground md:text-7xl">আল আহসান এআই</h1>
        <p className="mt-2 text-sm uppercase tracking-[0.4em] text-muted-foreground">Al Ahsan AI</p>
        <p className="mt-6 text-lg text-muted-foreground">
          জ্ঞান, লেখা, অনুবাদ, গবেষণা ও প্রোগ্রামিং — সব কাজে আপনার শক্তিশালী সহকারী। লিখে বা কথা বলে প্রশ্ন করুন।
        </p>
        <button
          onClick={signIn}
          disabled={busy}
          className="mt-10 inline-flex items-center gap-3 rounded-full border border-primary/60 bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground shadow-[0_0_40px_-8px_var(--primary)] transition hover:scale-[1.03] disabled:opacity-60"
        >
          <svg width="22" height="22" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          {busy ? "অপেক্ষা করুন…" : "গুগল দিয়ে প্রবেশ করুন"}
        </button>
        {err && <p className="mt-4 text-destructive">{err}</p>}
        <p className="mt-16 text-xs text-muted-foreground">মুহিউস সুন্নাহ ফাউন্ডেশন বাংলাদেশ</p>
      </div>
    </main>
  );
}
