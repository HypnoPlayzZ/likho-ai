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
      <Footer />
    </main>
  );
}

// ============ HERO ============

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center px-6 sm:px-10 lg:px-16 py-16 lg:py-24">
      <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass-card text-[11px] uppercase tracking-[0.2em] font-bold text-primary mb-6">
            <Sparkles className="w-3 h-3" strokeWidth={2.5} />
            Built for Indian English
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-primary leading-[1.05] tracking-tight">
            Write better English in any Windows app.
          </h1>
          <p className="mt-5 text-lg text-on-surface-variant leading-relaxed max-w-xl">
            Press <KeyHint>Alt</KeyHint>
            <span className="mx-1 text-on-surface-variant/60">+</span>
            <KeyHint>Space</KeyHint> anywhere. AI rewrites your text in 3 professional tones.
            Built for how Indians actually write — Hinglish, Indian English, lakh/crore.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <a
              href={DOWNLOAD_URL}
              id="download"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary-container text-on-primary-container text-sm font-bold hover:bg-primary-container/90 active:scale-[0.98] transition-all shadow-lg shadow-primary-container/25"
            >
              Download for Windows — free
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </a>
            <a
              href="#founding"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full glass-card text-primary text-sm font-bold hover:bg-surface-container-high active:scale-[0.98] transition-all"
            >
              <Sparkles className="w-4 h-4" strokeWidth={2.5} />
              Reserve founding-member access — ₹4,900 lifetime
            </a>
          </div>
          <p className="mt-4 text-xs text-on-surface-variant leading-relaxed max-w-md">
            5 free rewrites, no signup. Windows 11 · ~12&nbsp;MB.
            <br />
            <span className="text-on-surface-variant/80">
              Heads-up: the installer isn't code-signed yet. Windows will say{" "}
              <em>"Windows protected your PC"</em> — click <strong>More info</strong>{" "}
              → <strong>Run anyway</strong>. Signed installer coming soon.
            </span>
          </p>
        </div>

        <div className="flex justify-center lg:justify-end">
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
    <Section className="px-6 sm:px-10 lg:px-16 py-20">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          eyebrow="The problem"
          title="Existing tools weren't built for us."
          subtitle="The way we write in Indian English doesn't fit the assumptions of tools designed in San Francisco."
        />
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {cards.map((c) => (
            <div key={c.title} className="glass-card rounded-2xl p-6">
              <div className="w-9 h-9 rounded-full bg-error/15 border border-error/40 flex items-center justify-center mb-3">
                <X className="w-5 h-5 text-error" strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-bold text-primary leading-snug">
                {c.title}
              </h3>
              <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">{c.body}</p>
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
    <Section className="px-6 sm:px-10 lg:px-16 py-20">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          eyebrow="How it works"
          title="One hotkey. Three rewrites. Two seconds."
        />
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <div key={s.title} className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary/70">
                  Step {i + 1}
                </div>
                <span className="h-px flex-1 bg-primary-container/15" />
              </div>
              <div className="w-12 h-12 rounded-2xl bg-primary-container/10 border border-primary/25 flex items-center justify-center mb-3">
                <s.Icon className="w-6 h-6 text-primary" strokeWidth={2} />
              </div>
              <h3 className="text-lg font-bold text-primary">{s.title}</h3>
              <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">{s.body}</p>
            </div>
          ))}
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
  return (
    <Section className="px-6 sm:px-10 lg:px-16 py-20">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          eyebrow="Features"
          title="Everything in one Alt+Space."
        />
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div key={f.title} className="glass-card rounded-2xl p-5">
              <div className="w-10 h-10 rounded-xl bg-primary-container/10 border border-primary/25 flex items-center justify-center mb-3">
                <f.Icon className="w-5 h-5 text-primary" strokeWidth={2} />
              </div>
              <h3 className="text-base font-bold text-primary">{f.title}</h3>
              <p className="mt-1.5 text-sm text-on-surface-variant leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
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
    <Section id="founding" className="px-6 sm:px-10 lg:px-16 py-20">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          eyebrow="Pricing"
          title="Try free. Upgrade only if it's saving you time."
        />
        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`glass-card rounded-2xl p-6 flex flex-col ${
                t.featured ? "ring-2 ring-primary/40" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-primary">{t.name}</h3>
                {t.featured && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container">
                    <Sparkles className="w-2.5 h-2.5" strokeWidth={2.5} /> Best deal
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] font-semibold text-on-surface-variant">
                {t.tag}
              </div>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold text-primary">{t.price}</span>
                <span className="text-sm text-on-surface-variant">{t.sub}</span>
              </div>
              {t.highlight && (
                <div className="mt-2 text-[11px] uppercase tracking-[0.15em] font-bold text-secondary">
                  {t.highlight}
                </div>
              )}
              <ul className="mt-5 space-y-2 text-sm text-on-surface">
                {t.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <Check
                      className="w-4 h-4 text-primary shrink-0 mt-0.5"
                      strokeWidth={2.5}
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {t.cta && (
                <a
                  href={t.cta.href}
                  className={`mt-6 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all ${
                    t.featured
                      ? "bg-primary-container text-on-primary-container hover:bg-primary-container/90"
                      : "bg-surface-container/70 hover:bg-surface-container-high text-primary border border-primary/25"
                  }`}
                >
                  {t.cta.label}
                  <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                </a>
              )}
              {t.subscribe === "pro" && (
                <div className="mt-6">
                  <RazorpayProSubscribe />
                </div>
              )}
              {t.subscribe === "pro_plus" && (
                <div className="mt-6">
                  <RazorpayProPlusSubscribe />
                </div>
              )}
            </div>
          ))}
        </div>

        <div id="founding-form" className="mt-12 max-w-xl mx-auto">
          <div className="glass-card rounded-2xl p-6">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-primary mb-2">
              Lock in your founding spot
            </div>
            <h4 className="text-xl font-bold text-primary mb-3">
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
    <Section className="px-6 sm:px-10 lg:px-16 py-20">
      <div className="max-w-3xl mx-auto">
        <div className="glass-card rounded-3xl p-8 sm:p-10 relative">
          <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-primary mb-3">
            From the founder
          </div>
          <p className="text-lg text-on-surface leading-relaxed">
            I write 50+ messages a day in English — to clients, to my team, to people I haven't met.
          </p>
          <p className="mt-4 text-base text-on-surface-variant leading-relaxed">
            Grammarly never quite got me. It corrected my "do the needful" into something neither I nor the recipient
            recognised. ChatGPT was great, but switching tabs ten times a day broke my flow. So I built Likho — for
            people who think in two languages and write in one, who want to sound polished without losing themselves.
          </p>
          <p className="mt-4 text-base text-on-surface-variant leading-relaxed">
            If that sounds like you, I'd love for you to try it.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-container/15 border border-primary/30 flex items-center justify-center text-primary font-bold">
              C
            </div>
            <div>
              <div className="text-sm font-bold text-primary">Chetan</div>
              <div className="text-xs text-on-surface-variant">Founder, Likho.ai</div>
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
  return (
    <Section className="px-6 sm:px-10 lg:px-16 py-20">
      <div className="max-w-3xl mx-auto">
        <SectionHeading eyebrow="Questions" title="Frequently asked." />
        <div className="mt-10 space-y-3">
          {items.map((it) => (
            <details
              key={it.q}
              className="glass-card rounded-2xl p-5 group"
            >
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <h3 className="text-base font-bold text-primary pr-4">{it.q}</h3>
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary-container/10 border border-primary/25 flex items-center justify-center text-primary font-bold transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-on-surface-variant leading-relaxed">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ============ FOOTER ============

function Footer() {
  return (
    <footer className="px-6 sm:px-10 lg:px-16 pt-12 pb-8">
      <div className="max-w-7xl mx-auto glass-card rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div>
          <div className="text-base font-extrabold text-primary tracking-tight">
            Likho<span className="text-secondary">.</span>ai
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">
            © 2026 Likho. Built in India for Indian writers.
          </p>
        </div>
        <div className="flex items-center gap-3">
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
      className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-surface-container/70 hover:bg-surface-container-high border border-primary/15 text-primary transition-colors"
      title={label}
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
      <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-primary leading-tight tracking-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-base text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}
