import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BookOpen,
  Flame,
  ListOrdered,
  PenLine,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/app/guide")({
  head: () => ({
    meta: [
      { title: "Guide — People Opinion Box" },
      { name: "description", content: "How to use every tool in your dashboard, in simple English." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GuidePage,
});

const SECTIONS = [
  {
    icon: Users,
    title: "1. Reviewer Profiles",
    steps: [
      "This is where you create your own reviewers. Each reviewer has a name, age, photo and short bio.",
      "Click “New profile”, fill in the details, and save. You can make up to 100 profiles.",
      "Every review you post belongs to one of these reviewers, so create them first.",
      "Your profiles are private — only you can see and use them.",
    ],
  },
  {
    icon: ListOrdered,
    title: "2. Review Orders",
    steps: [
      "An order is a job: a list of review links you want to work on.",
      "Click “New order”, give it a name, and paste the review links (one per line).",
      "Open the order to see each link. The system reads the review text, reviewer name and rating for you.",
      "From the order page you can publish the reviews to your site and start DMCA reports.",
    ],
  },
  {
    icon: PenLine,
    title: "3. Post Reviews",
    steps: [
      "This publishes a review on your own public review page on this website.",
      "Pick one of your reviewer profiles, write the headline and review text, choose the star rating and date.",
      "After publishing you get a public link. Share it anywhere — it works great on phones.",
      "You can edit or unpublish a review later from the same page.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "4. DMCA Reports",
    steps: [
      "DMCA reports ask Google to remove a review link from search results.",
      "Open a Review Order, then use the DMCA box: pick a template and start the report.",
      "You can copy the ready-made notice text and submit it yourself, or use your personal browser extension which does it for you one by one.",
      "The extension needs your personal key — find it on the DMCA Reports page and paste it into the extension once.",
      "If you already reported every link in an order, use the “Allow re-report” button on the order page. You can do this maximum 3 times per order.",
    ],
  },
  {
    icon: ShieldAlert,
    title: "5. Policy Violation",
    steps: [
      "This tool checks if a review breaks Google's rules (spam, fake, hate speech, conflict of interest, and so on).",
      "Create an order, paste review links, and the system reads each review and gives a verdict with a reason.",
      "For reviews that break the rules, it writes a ready report text you can copy and send to Google.",
      "You can fix the verdict by hand if you disagree with the automatic one.",
    ],
  },
  {
    icon: Flame,
    title: "6. Fake Reviews",
    steps: [
      "This tool helps you flag reviews that look fake.",
      "Create an order with the target link, choose the reason, and add your comment texts.",
      "Follow the status on the order page to see what was done.",
    ],
  },
  {
    icon: Settings,
    title: "7. Settings",
    steps: [
      "Enter your 7-day access key here. Without an active key the tools stay locked.",
      "When your key expires, ask the admin for a new one.",
      "You can also chat with the admin from the Messages area if you need help.",
    ],
  },
] as const;

function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10">
          <BookOpen className="size-5 text-cyan-300" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold">How to use your dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Every tool explained in simple English, from A to Z.
          </p>
        </div>
      </div>

      {/* Important DMCA rule */}
      <div className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 shadow-[0_0_25px_rgba(245,158,11,0.08)]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <div>
            <h2 className="font-display text-base font-semibold text-amber-200">
              Important rule for DMCA reports — read this first
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-100/90">
              With <strong>1 Gmail account, send only 2 to 3 DMCA reports per day</strong> — never
              more. If you send more than that from the same Gmail, Google will mark all your
              reports as spam and <strong>every report will be rejected</strong>, even the good
              ones.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-100/90">
              Want to report more links in one day? Use a different Gmail account for each small
              batch (2–3 reports each), and spread your reports across the week. Slow and steady
              wins — rushed reporting gets everything thrown away.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {SECTIONS.map((s) => (
          <section key={s.title} className="press-panel p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-violet-500/30 bg-violet-500/10">
                <s.icon className="size-4 text-violet-300" />
              </span>
              <h2 className="font-display text-lg font-semibold">{s.title}</h2>
            </div>
            <ul className="space-y-2">
              {s.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-0.5 shrink-0 font-semibold text-cyan-300">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card/60 p-5 text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">Still stuck?</strong> Message the admin from your
          dashboard — describe what you clicked and what happened, and you'll get help.
        </p>
      </div>
    </div>
  );
}
