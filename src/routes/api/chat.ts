import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(40000) }))
    .min(1)
    .max(60),
});

const BASE_PROMPT = `তুমি "আল আহসান এআই" (Al Ahsan AI) — মুহিউস সুন্নাহ ফাউন্ডেশন বাংলাদেশ কর্তৃক তৈরি একটি অত্যন্ত শক্তিশালী, জ্ঞানী ও বিনয়ী সহকারী।
- ব্যবহারকারী যে ভাষায় লেখে সেই ভাষায় উত্তর দাও (ডিফল্ট: শুদ্ধ বাংলা)।
- গভীরভাবে চিন্তা করো, ধাপে ধাপে বিশ্লেষণ করো, নির্ভুল ও বিস্তারিত উত্তর দাও। প্রয়োজনে শিরোনাম, তালিকা, টেবিল ও কোড ব্লক ব্যবহার করো।
- লেখা, অনুবাদ, গণিত, প্রোগ্রামিং, গবেষণা, পরিকল্পনা, শিক্ষা — সব কাজে দক্ষতার সাথে সাহায্য করো।
- ইসলামি বিষয়ে কুরআন ও সহিহ হাদিসের আলোকে সতর্কতার সাথে উত্তর দাও, সূত্র উল্লেখ করো, এবং নিশ্চিত না হলে তা স্পষ্ট বলো।
- কখনো মিথ্যা তথ্য বানাবে না।`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const pub = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: u, error: ue } = await pub.auth.getUser(token);
        if (ue || !u.user) return new Response("Unauthorized", { status: 401 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid input", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: s } = await supabaseAdmin.from("ai_settings").select("*").eq("id", 1).maybeSingle();
        const provider = s?.provider ?? "lovable";
        const model = s?.model || "google/gemini-3.1-pro-preview";

        let url = "https://ai.gateway.lovable.dev/v1/chat/completions";
        let key = process.env.LOVABLE_API_KEY;
        if (provider === "google") {
          url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
          key = s?.google_api_key || undefined;
        } else if (provider === "openai") {
          url = "https://api.openai.com/v1/chat/completions";
          key = s?.openai_api_key || undefined;
        }
        if (!key) return new Response("এআই কী সেট করা নেই। অ্যাডমিন প্যানেল থেকে API কী যোগ করুন।", { status: 500 });

        let system = BASE_PROMPT;
        if (s?.admin_note?.trim()) {
          system += `\n\n=== অ্যাডমিনের নির্দেশনা (সর্বোচ্চ অগ্রাধিকার — অবশ্যই মেনে চলবে) ===\n${s.admin_note.trim()}`;
        }

        const body: Record<string, unknown> = {
          model,
          stream: true,
          messages: [{ role: "system", content: system }, ...parsed.data.messages],
        };
        if (provider === "lovable" && model.startsWith("openai/gpt-5.6")) body.reasoning_effort = "none";

        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          const t = await res.text();
          console.error(`AI request failed [${res.status}]: ${t}`);
          const msg =
            res.status === 429
              ? "অনেক বেশি অনুরোধ হয়েছে, একটু পরে চেষ্টা করুন।"
              : res.status === 402
                ? "এআই ক্রেডিট শেষ হয়ে গেছে।"
                : `এআই ত্রুটি [${res.status}]: ${t.slice(0, 300)}`;
          return new Response(msg, { status: res.status });
        }
        return new Response(res.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
