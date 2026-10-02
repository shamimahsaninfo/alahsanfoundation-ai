import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DEFAULT_MODELS, type Provider } from "@/lib/models";


const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(40000) }))
    .min(1)
    .max(60),
  images: z.array(z.string().max(8_000_000)).max(4).optional(),
  ctx: z
    .object({
      time: z.string().max(100).optional(),
      tz: z.string().max(100).optional(),
      ua: z.string().max(400).optional(),
      screen: z.string().max(50).optional(),
      lang: z.string().max(30).optional(),
      page: z.string().max(300).optional(),
      email: z.string().max(200).optional(),
    })
    .optional(),
});

const ADMIN_EMAIL = "alahsanfoundation.info@gmail.com";

function htmlToText(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title, body };
}

async function fetchUrl(url: string) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AlAhsanAI/1.0)", Accept: "text/html,application/json,text/plain,*/*" },
      redirect: "follow",
    });
    clearTimeout(t);
    const type = r.headers.get("content-type") || "";
    const raw = (await r.text()).slice(0, 400_000);
    const { title, body } = type.includes("html") ? htmlToText(raw) : { title: "", body: raw };
    return `### URL: ${url}\nস্ট্যাটাস: ${r.status}\nশিরোনাম: ${title}\n---\n${body.slice(0, 12000)}`;
  } catch (e) {
    return `### URL: ${url}\n(পেজটি খোলা যায়নি: ${(e as Error).message})`;
  }
}

async function webSearch(q: string) {
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AlAhsanAI/1.0)" },
    });
    const h = await r.text();
    const out: string[] = [];
    const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(h)) && out.length < 6) {
      let link = m[1];
      const u = link.match(/uddg=([^&]+)/);
      if (u) link = decodeURIComponent(u[1]);
      const strip = (x: string) => x.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").trim();
      out.push(`- ${strip(m[2])} — ${link}\n  ${strip(m[3])}`);
    }
    return out.length ? out.join("\n") : "";
  } catch {
    return "";
  }
}

const BASE_PROMPT = `তুমি "আল আহসান এআই" (Al Ahsan AI) — আল-আহসান ফাউন্ডেশন বাংলাদেশ কর্তৃক তৈরি একটি অত্যন্ত শক্তিশালী, জ্ঞানী ও বিনয়ী সহকারী।

## সাধারণ নিয়ম
- ব্যবহারকারী যে ভাষায় লেখে সেই ভাষায় উত্তর দাও (ডিফল্ট: শুদ্ধ বাংলা)।
- উত্তর দেওয়ার আগে নিজে নিজে ধাপে ধাপে চিন্তা করো, তারপর সুসংগঠিত, নির্ভুল ও বিস্তারিত উত্তর দাও। প্রয়োজনে শিরোনাম, তালিকা, টেবিল ও কোড ব্লক ব্যবহার করো।
- লেখা, অনুবাদ, গণিত, বিজ্ঞান, প্রোগ্রামিং, গবেষণা, ব্যবসা পরিকল্পনা, শিক্ষা — সব কাজে বিশেষজ্ঞের মতো সাহায্য করো।
- প্রশ্ন অস্পষ্ট হলে সবচেয়ে যুক্তিসঙ্গত অর্থ ধরে নিয়ে পূর্ণ উত্তর দাও; প্রয়োজনে শেষে একটি ছোট প্রশ্ন করো।
- কখনো মিথ্যা তথ্য বানাবে না; নিশ্চিত না হলে স্পষ্টভাবে বলো।
- ইসলামি বিষয়ে কুরআন ও সহিহ হাদিসের আলোকে সতর্কতার সাথে উত্তর দাও এবং সূত্র উল্লেখ করো।

## ওয়েবসাইট ও কোড তৈরি (বিশেষ দক্ষতা)
ব্যবহারকারী ওয়েবসাইট, পেজ, অ্যাপ, ল্যান্ডিং পেজ, ফর্ম, গেম বা যেকোনো কোড চাইলে:
- সম্পূর্ণ, চলনসই (copy-paste করেই চলবে) কোড দাও — কোনো "..." বা অসম্পূর্ণ অংশ রাখবে না।
- সাধারণ ওয়েবসাইটের জন্য একটি একক ফাইলের সম্পূর্ণ HTML দাও: \`<!DOCTYPE html>\` থেকে \`</html>\` পর্যন্ত, Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>), প্রয়োজনীয় ফন্ট (বাংলার জন্য Hind Siliguri / Noto Sans Bengali) ও vanilla JavaScript সহ।
- React চাইলে একটি সম্পূর্ণ কম্পোনেন্ট ফাইল দাও (TypeScript + Tailwind)।
- ডিজাইন হবে আধুনিক ও পেশাদার: মোবাইল-রেসপনসিভ, সুন্দর স্পেসিং, হেডার/নেভিগেশন, হিরো সেকশন, ফিচার, গ্যালারি, যোগাযোগ ফর্ম, ফুটার, হোভার ও স্ক্রল অ্যানিমেশন, SEO মেটা ট্যাগ ও accessible মার্কআপ।
- ছবির জায়গায় \`https://images.unsplash.com/...\` বা \`https://placehold.co/...\` ব্যবহার করো, ভাঙা লিংক দেবে না।
- প্রতিটি কোড ব্লকের ভাষা উল্লেখ করো (\`\`\`html, \`\`\`tsx ইত্যাদি) এবং কোডের পরে সংক্ষেপে ব্যবহারের নিয়ম লেখো।
- কোডে বাংলা টেক্সট থাকলে \`<html lang="bn">\` ও \`<meta charset="utf-8">\` দেবে।
- ওয়েবসাইট/পেজ চাইলে সবসময় একটি মাত্র সম্পূর্ণ \`\`\`html ব্লকে পুরো সাইট দেবে। সিস্টেম স্বয়ংক্রিয়ভাবে সেটি চালু করে চ্যাটেই লাইভ প্রিভিউ ও শেয়ারযোগ্য লাইভ লিংক (URL) তৈরি করে দেয় — তাই কখনো বলবে না "আমি লিংক দিতে পারি না"; বলবে "নিচে লাইভ লিংক ও প্রিভিউ তৈরি হচ্ছে"।
- আগের সাইটে পরিবর্তন চাইলে পুরো আপডেট করা HTML আবার দেবে (নতুন লাইভ লিংক তৈরি হবে)।

## তোমার বিশেষ ক্ষমতা (এগুলো সত্যিই আছে — ব্যবহার করো)
1. **URL পড়া:** ব্যবহারকারী কোনো লিংক দিলে সার্ভার সেই পেজ খুলে তার লেখা তোমাকে "ওয়েব থেকে আনা তথ্য" অংশে দেয়। সেটি পড়ে বিশ্লেষণ, সারাংশ, অনুবাদ, ত্রুটি খোঁজা — সব করো। পেজ না খুললে কারণ বলো।
2. **ইন্টারনেট সার্চ:** সাম্প্রতিক/আজকের তথ্যের প্রশ্নে সার্চ ফলাফল দেওয়া হয় — সেখান থেকে উত্তর দাও ও সূত্রের লিংক দাও।
3. **ছবি দেখা:** ব্যবহারকারী ছবি পাঠালে মনোযোগ দিয়ে দেখে বর্ণনা, লেখা পড়া (OCR), সমস্যা সমাধান, স্ক্রিনশটের ইন্টারফেস বিশ্লেষণ করো।
4. **লাইভ ওয়েবসাইট তৈরি:** উপরের নিয়মে।
5. **পরিবেশ জানা:** "বর্তমান পরিবেশ" অংশে তুমি কোন সার্ভার/মডেলে চলছ, ব্যবহারকারীর সময়, টাইমজোন, ডিভাইস ও স্ক্রিন জানতে পারো। জিজ্ঞেস করলে সঠিকভাবে বলো। ব্যবহারকারীর স্ক্রিন দেখাতে চাইলে স্ক্রিনশট পাঠাতে বলো — তুমি তা দেখে বিশ্লেষণ করতে পারবে।
6. **ফোনের সেটিংস:** নিরাপত্তার কারণে কোনো ওয়েবসাইট ফোনের সেটিং সরাসরি বদলাতে পারে না — এটা সততার সাথে এক লাইনে বলো, তারপর সেই সেটিং চালু করার নির্ভুল ধাপগুলো (Settings → ...) Android ও iPhone উভয়ের জন্য দাও, যাতে ব্যবহারকারী ১০ সেকেন্ডে নিজেই করতে পারে।
7. **অভিযোগ:** কেউ অভিযোগ/সমস্যা/পরামর্শ জানাতে চাইলে বলো চ্যাটের উপরের "অভিযোগ" বাটন চেপে লিখলে তা সরাসরি অ্যাডমিনের কাছে পৌঁছাবে।

## আচরণ
- তুমি বিশ্বসেরা এআই সহকারীদের মতো দক্ষ: গভীর চিন্তা, নির্ভুল যুক্তি, পরিষ্কার উত্তর। যুক্তিসঙ্গত কাজে কখনো "পারব না" বলে থেমে যাবে না — সমাধানের সর্বোত্তম পথ দেখাবে।
- উত্তর হবে উষ্ণ, বিনয়ী ও সরাসরি — অপ্রয়োজনীয় লম্বা ভূমিকা নয়।
- পুরো কথোপকথন মনে রাখবে; আগের বার্তার প্রসঙ্গ ধরে উত্তর দেবে।

## আল-আহসান ফাউন্ডেশন বাংলাদেশ
প্রতিষ্ঠিত ২০২৬; স্লোগান: "মানবসেবা ও ইসলামী শিক্ষার প্রসারেই আমাদের লক্ষ্য"। কার্যক্রম: বিনামূল্যে কুরআন ও দ্বীনি শিক্ষা (হিফজ), এতিম ও দরিদ্র সহায়তা, ত্রাণ ও জরুরি মানবিক সহায়তা, যাকাত ও সদকা তহবিল। অরাজনৈতিক ও অলাভজনক। ওয়েবসাইট: https://alahsanfoundationinfo-op.github.io/https-alahsanfoundationinfo-op.github.io/
অ্যাডমিন: ${ADMIN_EMAIL} — এই ইমেইলের ব্যবহারকারী তোমার অ্যাডমিন; তাকে চিনবে ও সম্মান করবে।`;


type Attempt = { url: string; key: string; model: string; label: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const pub = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: u, error: ue } = await pub.auth.getUser(token);
        if (ue || !u.user) return new Response("Unauthorized", { status: 401 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid input", { status: 400 });
        const { images, ctx } = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: s } = await supabaseAdmin.from("ai_settings").select("*").eq("id", 1).maybeSingle();
        const provider = (s?.provider ?? "lovable") as Provider;
        const stored = (s?.model || "").trim();
        const retired = /^gemini-(1|2)\.|^gpt-3|^o1-|^o3-mini|^gemini-pro$/i.test(stored);
        const model = !stored || retired ? DEFAULT_MODELS[provider] : stored;
        const lovKey = process.env['LOVABLE_API_KEY'] || "";
        const LOV = "https://ai.gateway.lovable.dev/v1/chat/completions";

        // Build attempt chain: chosen model first, then automatic backups (fixes 429/503).
        const attempts: Attempt[] = [];
        if (provider === "google" && s?.google_api_key) {
          const G = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
          for (const m of [model, "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3-flash-preview"])
            attempts.push({ url: G, key: s.google_api_key, model: m, label: `Google Gemini API (${m})` });
        } else if (provider === "openai" && s?.openai_api_key) {
          for (const m of [model, "gpt-4.1", "gpt-4o"])
            attempts.push({ url: "https://api.openai.com/v1/chat/completions", key: s.openai_api_key, model: m, label: `OpenAI (${m})` });
        } else if (provider === "lovable") {
          attempts.push({ url: LOV, key: lovKey, model, label: `আল-আহসান ক্লাউড (${model})` });
        }
        if (lovKey) {
          for (const m of ["google/gemini-3-flash-preview", "google/gemini-3.1-flash-lite"])
            attempts.push({ url: LOV, key: lovKey, model: m, label: `আল-আহসান ক্লাউড ব্যাকআপ (${m})` });
        }
        const seen = new Set<string>();
        const chain = attempts.filter((a) => a.key && !seen.has(a.url + a.model) && seen.add(a.url + a.model));
        if (!chain.length) return new Response("এআই কী সেট করা নেই। অ্যাডমিন প্যানেল থেকে API কী যোগ করুন।", { status: 500 });

        // Clean history: never feed old error messages back to the model.
        const history = parsed.data.messages.filter((m) => !(m.role === "assistant" && (m.content.startsWith("⚠️") || !m.content.trim())));
        const last = history[history.length - 1];
        const lastText = last?.role === "user" ? last.content : "";

        // Live web: read URLs + search.
        let web = "";
        const urls = Array.from(new Set(lastText.match(/https?:\/\/[^\s)<>"']+/g) ?? [])).slice(0, 3);
        if (urls.length) web += (await Promise.all(urls.map(fetchUrl))).join("\n\n");
        if (!urls.length && /সার্চ|খুঁজ|আজকের|সর্বশেষ|সাম্প্রতিক|খবর|নিউজ|দাম|আবহাওয়া|search|latest|news|today|price|weather|202[5-9]/i.test(lastText)) {
          const r = await webSearch(lastText.slice(0, 200));
          if (r) web += `### ইন্টারনেট সার্চ ফলাফল ("${lastText.slice(0, 80)}")\n${r}`;
        }

        const isAdmin = (u.user.email || "").toLowerCase() === ADMIN_EMAIL;
        let system = BASE_PROMPT;
        system += `\n\n## বর্তমান পরিবেশ\n- সার্ভার/মডেল: ${chain[0].label}\n- সার্ভারের সময় (UTC): ${new Date().toISOString()}\n- ব্যবহারকারীর স্থানীয় সময়: ${ctx?.time ?? "অজানা"} (টাইমজোন: ${ctx?.tz ?? "অজানা"})\n- ডিভাইস/ব্রাউজার: ${ctx?.ua ?? "অজানা"}\n- স্ক্রিন: ${ctx?.screen ?? "অজানা"}, ভাষা: ${ctx?.lang ?? "অজানা"}\n- ব্যবহারকারীর ইমেইল: ${u.user.email ?? "অজানা"}${isAdmin ? " — ইনি তোমার অ্যাডমিন।" : ""}`;
        if (s?.admin_note?.trim()) {
          system += `\n\n=== অ্যাডমিনের নির্দেশনা (সর্বোচ্চ অগ্রাধিকার — অবশ্যই মেনে চলবে) ===\n${s.admin_note.trim()}`;
        }
        if (web) system += `\n\n## ওয়েব থেকে আনা তথ্য (এইমাত্র লাইভ সংগ্রহ করা)\n${web}`;

        const msgs: unknown[] = history.map((m, i) =>
          i === history.length - 1 && m.role === "user" && images?.length
            ? { role: "user", content: [{ type: "text", text: m.content || "এই ছবিটি দেখে বিশ্লেষণ করো।" }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] }
            : m,
        );

        let lastErr = "";
        let lastStatus = 500;
        for (const a of chain) {
          const body: Record<string, unknown> = { model: a.model, stream: true, messages: [{ role: "system", content: system.replace(chain[0].label, a.label) }, ...msgs] };
          if (a.url === LOV && a.model.startsWith("openai/gpt-5.6")) body['reasoning_effort'] = "none";
          try {
            const res = await fetch(a.url, {
              method: "POST",
              headers: { Authorization: `Bearer ${a.key}`, "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: request.signal,
            });
            if (res.ok && res.body) {
              return new Response(res.body, {
                headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-AI-Model": a.label },
              });
            }
            lastStatus = res.status;
            lastErr = (await res.text()).slice(0, 300);
            console.error(`AI attempt failed ${a.label} [${res.status}]: ${lastErr}`);
            if (res.status === 401 && a.url !== LOV) continue; // bad user key → try backup
            if (![404, 429, 500, 502, 503, 504, 400].includes(res.status)) break;
            await new Promise((r) => setTimeout(r, 400));
          } catch (e) {
            if (request.signal.aborted) return new Response("aborted", { status: 499 });
            lastErr = (e as Error).message;
          }
        }
        const msg =
          lastStatus === 429 ? "সব সার্ভার এখন ব্যস্ত, কয়েক সেকেন্ড পরে আবার চেষ্টা করুন।"
          : lastStatus === 402 ? "এআই ক্রেডিট শেষ হয়ে গেছে।"
          : `এআই ত্রুটি [${lastStatus}]: ${lastErr}`;
        return new Response(msg, { status: lastStatus });
      },
    },
  },
});
