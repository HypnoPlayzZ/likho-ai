import {
  Mail,
  Linkedin,
  Twitter,
  Briefcase,
  Zap,
  Languages,
  Lock,
  Box,
  Mic,
  MousePointerClick,
  Keyboard,
  ArrowRight,
  Sparkles,
  Check,
  X,
  Globe,
  ChevronDown,
  Quote,
  type LucideIcon,
} from "lucide-react";
import { InteractiveMockup } from "@/components/InteractiveMockup";
import { Section } from "@/components/Section";
import { RazorpayCheckout } from "@/components/RazorpayCheckout";
import { RazorpayProSubscribe } from "@/components/RazorpayProSubscribe";
import { RazorpayProPlusSubscribe } from "@/components/RazorpayProPlusSubscribe";
import { FoundingSpotsBadge } from "@/components/FoundingSpotsBadge";

// Stable filename uploaded to every GitHub release. Versioned filenames
// (e.g. Likho_0.2.0_x64_en-US.msi) would break this URL on the next bump.
const DOWNLOAD_URL =
  "https://github.com/HypnoPlayzZ/likho-ai/releases/latest/download/Likho-Setup.msi";

export default function Page() {
  return (
    <main className="relative">
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <Pricing />
      <FounderNote />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}

// ============ HERO ============

function Hero() {
  return (
    <section
      id="top"
      className="relative isolate overflow-hidden px-6 sm:px-10 lg:px-16 pt-12 lg:pt-20 pb-20 lg:pb-28"
    >
      {/* Decorative gradient orbs — premium volumetric depth without weight. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 w-[36rem] h-[36rem] rounded-full bg-primary-container/15 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -right-40 w-[28rem] h-[28rem] rounded-full bg-secondary/10 blur-[140px]"
      />

      <div className="relative max-w-7xl mx-auto w-full grid lg:grid-cols-[1.1fr_1fr] gap-14 lg:gap-20 items-center min-h-[calc(100vh-5rem)]">
        <div className="animate-fade-up">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass-card text-[11px] uppercase tracking-[0.2em] font-bold text-primary mb-7">
            <Sparkles className="w-3 h-3" strokeWidth={2.5} />
            Built for Indian English
          </div>
          <h1 className="display-tight text-[clamp(2.5rem,6vw,4.25rem)] font-extrabold text-on-surface leading-[1.02]">
            <span className="gradient-text">Write better English</span>
            <br />
            in any Windows app.
          </h1>
          <p className="mt-6 text-lg lg:text-xl text-on-surface-variant leading-relaxed max-w-xl">
            Press <KeyHint>Alt</KeyHint>
            <span className="mx-1 text-on-surface-variant/60">+</span>
            <KeyHint>Space</KeyHint> anywhere. AI rewrites your text in 3 professional tones.
            Built for how Indians actually write — Hinglish, Indian English, lakh/crore.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <a
              href={DOWNLOAD_URL}
              id="download"
              className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-primary-container text-on-primary-container text-sm font-bold hover:bg-primary-container/90 active:scale-[0.98] transition-all shadow-xl shadow-primary-container/30"
            >
              Download for Windows — free
              <ArrowRight
                className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.5}
              />
            </a>
            <a
              href="#founding"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-transparent text-primary text-sm font-bold border border-primary/35 hover:border-primary/60 hover:bg-primary-container/10 active:scale-[0.98] transition-all"
            >
              <Sparkles className="w-4 h-4" strokeWidth={2.5} />
              Reserve founding-member access — ₹4,900 lifetime
            </a>
          </div>
          <p className="mt-5 text-xs text-on-surface-variant leading-relaxed max-w-md">
            5 free rewrites, no signup. Windows 11 · ~12&nbsp;MB.
            <br />
            <span className="text-on-surface-variant/80">
              Heads-up: the installer isn't code-signed yet. Windows will say{" "}
              <em>"Windows protected your PC"</em> — click <strong>More info</strong>{" "}
              → <strong>Run anyway</strong>. Signed installer coming soon.
            </span>
          </p>
        </div>

        <div className="relative flex justify-center lg:justify-end">
          <div aria-hidden className="halo" />
          <InteractiveMockup />
        </div>
      </div>
    </section>
  );
}

function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded-md text-[11px] font-mono font-bold uppercase tracking-wide bg-surface-container-high border border-primary/30 text-primary shadow-sm">
      {children}
    </kbd>
  );
}

// ============ PROBLEM ============

function Problem() {
  const cards = [
    {
      title: "Grammarly is built for native speakers",
      body:
        "It flags your Indian English idioms as errors. \"Do the needful\" is corrected to gibberish. Hinglish is unrecognised. The suggestions feel wrong.",
    },
    {
      title: "ChatGPT means switching tabs every time",
      body:
        "Compose in Outlook → switch to ChatGPT → paste → wait → copy → switch back → paste. By the email's third reply, you've stopped using it.",
    },
    {
      title: "Translation tools translate. They don't communicate.",
      body:
        "Google Translate gives you a literal conversion. What you actually need is a tone shift — formal for the manager, friendly for the team, concise for the chat.",
    },
  ];
  return (
    <Section id="problem" className="px-6 sm:px-10 lg:px-16 py-24">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          eyebrow="The problem"
          title="Existing tools weren't built for us."
          subtitle="The way we write in Indian English doesn't fit the assumptions of tools designed in San Francisco."
        />
        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {cards.map((c) => (
            <div
              key={c.title}
              className="lift glass-card rounded-2xl p-7 relative"
            >
              <div className="w-10 h-10 rounded-xl bg-error/15 border border-error/40 flex items-center justify-center mb-4">
                <X className="w-5 h-5 text-error" strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-bold text-on-surface leading-snug">
                {c.title}
              </h3>
              <p className="mt-2.5 text-sm text-on-surface-variant leading-relaxed">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ============ HOW IT WORKS ============

function HowItWorks() {
  const steps: { Icon: LucideIcon; title: string; body: string }[] = [
    {
      Icon: MousePointerClick,
      title: "Select your text",
      body: "In Outlook, Gmail, WhatsApp Desktop, LinkedIn, Excel — any Windows app where you can highlight text.",
    },
    {
      Icon: Keyboard,
      title: "Press Alt + Space",
      body: "The overlay appears right next to your cursor. Your source app keeps focus.",
    },
    {
      Icon: Sparkles,
      title: "Click your tone",
      body: "Three rewrites in two seconds. Click one — Likho pastes it back, replacing your selection.",
    },
  ];
  return (
    <Section id="how" className="px-6 sm:px-10 lg:px-16 py-24">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          eyebrow="How it works"
          title="One hotkey. Three rewrites. Two seconds."
        />
        <div className="mt-16 relative md:step-connector">
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="lift glass-card rounded-2xl p-7 relative"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="relative shrink-0 w-14 h-14 rounded-2xl bg-primary-container/15 border border-primary/30 flex items-center justify-center text-primary font-extrabold text-lg">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-on-surface-variant">
                    Step {i + 1}
                  </div>
                </div>
                <div className="w-11 h-11 rounded-xl bg-surface-container-high/70 border border-outline-variant/50 flex items-center justify-center mb-4">
                  <s.Icon className="w-5 h-5 text-primary" strokeWidth={2} />
                </div>
                <h3 className="text-lg font-bold text-on-surface">{s.title}</h3>
                <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

// ============ FEATURES ============

function Features() {
  const features: { Icon: LucideIcon; title: string; body: string }[] = [
    {
      Icon: Zap,
      title: "3 tones in 2 seconds",
      body: "Professional, Concise, Friendly. Pick what fits the moment.",
    },
    {
      Icon: Mic,
      title: "Voice mode (Alt+V) — Pro+",
      body: "Hold Alt+V, speak Hindi or English, release. Likho returns polished business English in ~3 seconds.",
    },
    {
      Icon: Languages,
      title: "Hinglish to English",
      body: "Type in Hinglish. Get a clean, professional rewrite. The model auto-detects.",
    },
    {
      Icon: Globe,
      title: "Works in every Windows app",
      body: "Outlook, Gmail web, WhatsApp Desktop, LinkedIn, Excel, Tally, Notepad — anywhere.",
    },
    {
      Icon: Briefcase,
      title: "Indian context built in",
      body: "Lakh/crore, regional idioms, hierarchical politeness. The defaults are familiar.",
    },
    {
      Icon: Lock,
      title: "Privacy-first",
      body: "Your text is never stored. We log metadata only — char count, latency, tone selected.",
    },
    {
      Icon: Box,
      title: "12MB installer",
      body: "Native Windows app. Tiny download. Runs lean — under 50MB RAM.",
    },
  ];
  // Voice mode (index 1) becomes the bento hero card; the rest fall into a
  // 3-col grid below it. Same data, asymmetric layout for premium feel.
  const [zap, voice, ...rest] = features;
  return (
    <Section id="features" className="px-6 sm:px-10 lg:px-16 py-24">
      <div className="max-w-7xl mx-auto">
        <SectionHeading eyebrow="Features" title="Everything in one Alt+Space." />
        <div className="mt-14 grid lg:grid-cols-3 gap-5">
          {/* Bento hero — Voice mode spans 2 cols on desktop. */}
          <div className="lift glass-card-strong rounded-2xl p-8 lg:col-span-2 relative overflow-hidden">
            <div
              aria-hidden
              className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-secondary/15 blur-3xl"
            />
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-secondary/15 border border-secondary/35 flex items-center justify-center mb-5">
                <voice.Icon className="w-6 h-6 text-secondary" strokeWidth={2} />
              </div>
              <h3 className="text-2xl font-extrabold text-on-surface tracking-tight">
                {voice.title}
              </h3>
              <p className="mt-2.5 text-base text-on-surface-variant leading-relaxed max-w-lg">
                {voice.body}
              </p>
            </div>
          </div>
          {/* Zap — 1 col, paired alongside Voice on lg. */}
          <FeatureTile {...zap} />
          {/* Remaining features — 3 cols. */}
          {rest.map((f) => (
            <FeatureTile key={f.title} {...f} />
          ))}
        </div>
      </div>
    </Section>
  );
}

function FeatureTile({
  Icon,
  title,
  body,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="lift glass-card rounded-2xl p-6">
      <div className="w-10 h-10 rounded-xl bg-primary-container/10 border border-primary/25 flex items-center justify-center mb-3.5">
        <Icon className="w-5 h-5 text-primary" strokeWidth={2} />
      </div>
      <h3 className="text-base font-bold text-on-surface">{title}</h3>
      <p className="mt-1.5 text-sm text-on-surface-variant leading-relaxed">{body}</p>
    </div>
  );
}

// ============ PRICING ============

type Tier = {
  name: string;
  tag: string;
  price: string;
  sub: string;
  bullets: string[];
  highlight?: string;
  cta?: { label: string; href: string };
  subscribe?: "pro" | "pro_plus";
  featured: boolean;
  popular?: boolean;
};

function Pricing() {
  const tiers: Tier[] = [
    {
      name: "Free",
      tag: "Try it now",
      price: "₹0",
      sub: "5 demo rewrites",
      bullets: ["3 tones", "Hinglish detection", "All Windows apps"],
      cta: { label: "Download for Windows", href: DOWNLOAD_URL },
      featured: false,
    },
    {
      name: "Pro",
      tag: "Available now",
      price: "₹299",
      sub: "/month",
      bullets: [
        "Unlimited rewrites",
        "3 tones + Hinglish",
        "Indian English idioms",
        "Priority response time",
      ],
      subscribe: "pro",
      featured: false,
    },
    {
      name: "Pro+",
      tag: "New — voice mode",
      price: "₹499",
      sub: "/month",
      highlight: "Includes voice mode",
      bullets: [
        "Everything in Pro",
        "Voice mode (Alt+V) — Hindi/English/Hinglish",
        "Long-email summaries",
        "Custom tone presets",
      ],
      subscribe: "pro_plus",
      featured: false,
      popular: true,
    },
    {
      name: "Founding member",
      tag: "First 50 only",
      price: "₹4,900",
      sub: "lifetime, one-time",
      highlight: "Voice mode included for life",
      bullets: [
        "Everything in Pro+, forever",
        "Voice mode included from day one",
        "Locked-in price — never goes up",
        "Priority support directly from the founder",
      ],
      cta: { label: "Reserve my spot", href: "#founding-form" },
      featured: true,
    },
  ];
  return (
    <Section id="pricing" className="px-6 sm:px-10 lg:px-16 py-24">
      <div className="max-w-7xl mx-auto">
        {/* Backwards-compatible anchor — hero CTA links to #founding. */}
        <span id="founding" className="sr-only" aria-hidden />
        <SectionHeading
          eyebrow="Pricing"
          title="Try free. Upgrade only if it's saving you time."
        />
        <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`lift rounded-2xl p-7 flex flex-col relative ${
                t.featured
                  ? "glass-card-featured"
                  : t.popular
                    ? "glass-card-featured"
                    : "glass-card"
              }`}
            >
              {t.popular && !t.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] font-bold px-3 py-1 rounded-full bg-secondary text-on-secondary shadow-md">
                  <Sparkles className="w-3 h-3" strokeWidth={2.5} /> Most popular
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-extrabold text-on-surface">{t.name}</h3>
                {t.featured && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container">
                    <Sparkles className="w-2.5 h-2.5" strokeWidth={2.5} /> Best deal
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] font-semibold text-on-surface-variant">
                {t.tag}
              </div>
              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="text-[2.75rem] leading-none font-extrabold text-on-surface tracking-tight">
                  {t.price}
                </span>
                <span className="text-sm text-on-surface-variant">{t.sub}</span>
              </div>
              {t.highlight && (
                <div className="mt-2 text-[11px] uppercase tracking-[0.15em] font-bold text-secondary">
                  {t.highlight}
                </div>
              )}
              <ul className="mt-6 space-y-2.5 text-sm text-on-surface flex-1">
                {t.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5">
                    <span className="mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-container/25 shrink-0">
                      <Check className="w-3 h-3 text-primary" strokeWidth={3} />
                    </span>
                    <span className="leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
              {t.cta && (
                <a
                  href={t.cta.href}
                  className={`mt-7 inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-full text-sm font-bold transition-all active:scale-[0.98] ${
                    t.featured
                      ? "bg-primary-container text-on-primary-container hover:bg-primary-container/90 shadow-lg shadow-primary-container/30"
                      : "bg-surface-container/70 hover:bg-surface-container-high text-primary border border-primary/25"
                  }`}
                >
                  {t.cta.label}
                  <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                </a>
              )}
              {t.subscribe === "pro" && (
                <div className="mt-7">
                  <RazorpayProSubscribe />
                </div>
              )}
              {t.subscribe === "pro_plus" && (
                <div className="mt-7">
                  <RazorpayProPlusSubscribe />
                </div>
              )}
            </div>
          ))}
        </div>

        <div id="founding-form" className="mt-14 max-w-xl mx-auto">
          <div className="glass-card-featured rounded-2xl p-7">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-primary mb-2">
              Lock in your founding spot
            </div>
            <h4 className="text-xl font-extrabold text-on-surface mb-3 tracking-tight">
              Pay ₹4,900 today — lifetime, locked-in price
            </h4>
            <FoundingSpotsBadge />
            <RazorpayCheckout />
          </div>
        </div>
      </div>
    </Section>
  );
}

// ============ FOUNDER NOTE ============

function FounderNote() {
  return (
    <Section className="px-6 sm:px-10 lg:px-16 py-24">
      <div className="max-w-3xl mx-auto">
        <div className="glass-card rounded-3xl p-8 sm:p-12 relative overflow-hidden">
          <Quote
            aria-hidden
            className="absolute -top-2 -left-2 w-24 h-24 text-primary/10"
            strokeWidth={1.5}
          />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-primary mb-4">
              From the founder
            </div>
            <p className="text-xl sm:text-2xl text-on-surface leading-snug font-semibold tracking-tight">
              I write 50+ messages a day in English — to clients, to my team, to people I haven't met.
            </p>
            <p className="mt-5 text-base text-on-surface-variant leading-relaxed">
              Grammarly never quite got me. It corrected my "do the needful" into something neither I nor the recipient
              recognised. ChatGPT was great, but switching tabs ten times a day broke my flow. So I built Likho — for
              people who think in two languages and write in one, who want to sound polished without losing themselves.
            </p>
            <p className="mt-4 text-base text-on-surface-variant leading-relaxed">
              If that sounds like you, I'd love for you to try it.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-primary-container/20 border border-primary/35 flex items-center justify-center text-primary font-extrabold">
                  C
                </div>
                <div>
                  <div className="text-sm font-bold text-on-surface">Chetan</div>
                  <div className="text-xs text-on-surface-variant">Founder, Likho.ai</div>
                </div>
              </div>
              <a
                href={DOWNLOAD_URL}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary-container text-on-primary-container px-5 py-2.5 text-sm font-bold hover:bg-primary-container/90 active:scale-[0.98] transition-all shadow-lg shadow-primary-container/25"
              >
                Download for Windows — free
                <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ============ FAQ ============

function FAQ() {
  const items = [
    {
      q: "Will my text be stored anywhere?",
      a: "No. We log metadata only — character count, response time, tone selected. The actual text you rewrite is never persisted by us, and the AI provider doesn't retain it either.",
    },
    {
      q: "Does it work offline?",
      a: "No. The AI model is cloud-hosted (we use Gemini Flash 2.5 today), so an internet connection is required. Outages are rare but real — sorry in advance.",
    },
    {
      q: "Is it really for Indians only?",
      a: "Anyone can use it. The defaults — British spelling, Hinglish detection, Indian English idioms, lakh/crore — are tuned for Indian writers. If you write in plain American English, it'll still rewrite cleanly.",
    },
    {
      q: "What's voice mode?",
      a: "Hold Alt+V anywhere on Windows, speak in Hindi or English (or both — Hinglish works), release the keys. Likho transcribes and converts what you said into clean professional English ready to paste into Outlook, WhatsApp, LinkedIn, or wherever. Three tones to pick from, just like text rewrites. Voice mode is included in Pro+ and Founding tiers.",
    },
    {
      q: "What's the difference between Pro and Pro+?",
      a: "Pro (₹299/mo) is unlimited text rewrites — three tones, Hinglish, Indian English. Pro+ (₹499/mo) adds voice mode (Alt+V), long-email summaries, and custom tone presets. If you mostly type, Pro is enough. If you also dictate emails or messages while walking around, Pro+ pays for itself fast.",
    },
    {
      q: "What happens to founding members?",
      a: "Lifetime access — voice mode included from day one, every future feature included forever. ₹4,900 once, never charged again. Priority support straight from the founder. Direct input on the roadmap. Capped at 50 to keep the support load real.",
    },
  ];
  // FAQPage structured data — same Q&As as rendered, eligible for the
  // Google FAQ rich snippet on the SERP. Built from the same array so
  // the markup never drifts from what the user sees.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
  return (
    <Section id="faq" className="px-6 sm:px-10 lg:px-16 py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="max-w-3xl mx-auto">
        <SectionHeading eyebrow="Questions" title="Frequently asked." />
        <div className="mt-12 space-y-2.5">
          {items.map((it) => (
            <details
              key={it.q}
              className="group rounded-2xl border border-outline-variant/40 bg-surface-container-low/50 hover:bg-surface-container-low/80 open:bg-surface-container-low/80 open:border-primary/30 transition-colors"
            >
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none p-5 sm:p-6">
                <h3 className="text-base font-bold text-on-surface pr-2">
                  {it.q}
                </h3>
                <span className="shrink-0 w-8 h-8 rounded-full bg-surface-container-high/70 border border-outline-variant/60 group-open:bg-primary-container/30 group-open:border-primary/40 flex items-center justify-center text-primary transition-all">
                  <ChevronDown
                    className="w-4 h-4 transition-transform duration-300 group-open:rotate-180"
                    strokeWidth={2.5}
                  />
                </span>
              </summary>
              <p className="px-5 sm:px-6 pb-5 sm:pb-6 -mt-1 text-sm text-on-surface-variant leading-relaxed">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ============ FINAL CTA ============

function FinalCTA() {
  return (
    <Section className="px-6 sm:px-10 lg:px-16 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl glass-card-featured p-10 sm:p-14">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary-container/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-secondary/15 blur-3xl"
          />
          <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high/60 border border-primary/25 text-[11px] uppercase tracking-[0.2em] font-bold text-primary mb-4">
                <Sparkles className="w-3 h-3" strokeWidth={2.5} />
                Built for Indian English
              </div>
              <h2 className="display-tight text-3xl sm:text-4xl font-extrabold text-on-surface leading-tight">
                Write better English in any Windows app.
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <a
                href={DOWNLOAD_URL}
                className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-primary-container text-on-primary-container text-sm font-bold hover:bg-primary-container/90 active:scale-[0.98] transition-all shadow-xl shadow-primary-container/30 whitespace-nowrap"
              >
                Download for Windows — free
                <ArrowRight
                  className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2.5}
                />
              </a>
              <a
                href="#founding"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-primary text-sm font-bold border border-primary/35 hover:border-primary/60 hover:bg-primary-container/10 active:scale-[0.98] transition-all whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" strokeWidth={2.5} />
                Reserve founding-member access
              </a>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ============ FOOTER ============

function Footer() {
  return (
    <footer className="px-6 sm:px-10 lg:px-16 pt-12 pb-10 border-t border-outline-variant/30 mt-8">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-6 sm:items-center sm:justify-between">
        <div>
          <div className="text-base font-extrabold text-on-surface tracking-tight">
            Likho<span className="text-secondary">.</span>ai
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">
            © 2026 Likho. Built in India for Indian writers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FooterLink href="mailto:hello@likho.ai" label="Email">
            <Mail className="w-4 h-4" strokeWidth={2} />
          </FooterLink>
          <FooterLink href="https://x.com/likho_ai" label="X (Twitter)">
            <Twitter className="w-4 h-4" strokeWidth={2} />
          </FooterLink>
          <FooterLink href="https://www.linkedin.com/company/likho-ai" label="LinkedIn">
            <Linkedin className="w-4 h-4" strokeWidth={2} />
          </FooterLink>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-surface-container/60 hover:bg-surface-container-high border border-outline-variant/40 hover:border-primary/35 text-primary transition-colors"
      title={label}
      aria-label={label}
    >
      {children}
    </a>
  );
}

// ============ Shared building blocks ============

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="text-center">
      <div className="inline-block text-[11px] uppercase tracking-[0.25em] font-bold text-primary">
        {eyebrow}
      </div>
      <h2 className="display-tight mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-on-surface leading-[1.05]">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-base sm:text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}
