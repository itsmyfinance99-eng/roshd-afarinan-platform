# پرامپت Claude Design — بازطراحی v2 سایت رشدآفرینان (تم «مس و گرافیت»)

**راهنمای استفاده:**

1. در Claude Design همان پروژه‌ی قبلی (`5c1ac6ab-902c-4365-8c80-3d445afff738`) را باز کنید تا صفحات و ساختار فعلی در دسترسش باشد. اگر نشد، پروژه‌ی جدید بسازید؛ پرامپت خودکفاست.
2. کل بلوک «PROMPT» را یک‌جا کپی و ارسال کنید.
3. بعد از خروجی اول، «پیام‌های پیگیری» انتهای فایل را یکی‌یکی بفرستید.
4. خروجی را مثل دفعه‌ی قبل handoff بگیرید؛ طبق روند ST-04.07 به Next.js منتقل می‌شود.

پرامپت انگلیسی است چون اصطلاحات طراحی و حرکت و نام کامپوننت‌های 21st.dev انگلیسی‌اند و ابزار دقیق‌تر عمل می‌کند؛ همه‌ی متن‌های روی صفحه فارسی و از محتوای واقعی سایت‌اند. تم «مس و گرافیت» در پیش‌نمایش تأیید شده است.

---

## PROMPT

```text
Redesign the Roshd Afarinan website (رشدآفرینان صنعت و معدن) as a v2 visual refresh in a new theme,
"Copper & Graphite". The current design is correct but plain and reads too much like another site.
I want it striking, premium and alive — dark graphite, warm copper light, confident motion — while
still reading as a serious industrial, mining, feasibility and investment consultancy. Keep the
information architecture, routes and navigation labels exactly as they are; change the visual and
motion layer.

WHO THIS IS FOR
A Yazd-based cooperative (founded 1388) of 50+ experts in engineering, economics, management, law,
insurance, tax and IT, working in training, research and consulting. The platform connects the
chain: training → knowledge → research → feasibility → project → financing → investment →
Iran Sahamdar. Visitors are industrial and mining entrepreneurs, investors and managers in Iran.
Trustworthy first, impressive second. Copper is the mining metaphor; graphite is industry.

NON-NEGOTIABLES
1. Persian, right-to-left. <html lang="fa-IR" dir="rtl">. Every layout, icon direction, arrow and
   horizontal motion is mirrored for RTL. Numbers use Persian digits (۰–۹).
2. Typography: headings in Noto Kufi Arabic (weight 700–800), body in Vazirmatn (400–500, 700 for
   emphasis). Both are open-licence. Persian line-height 1.5–1.6 for Kufi headings, 1.9–2.1 for body.
   No letter-spacing on Persian text.
3. NEVER animate Persian text per character. Splitting Persian into per-letter spans breaks cursive
   joining and renders isolated letter forms. Animate per WORD or per LINE only. Replace any
   typewriter or per-character reveal with a word-level fade/slide or a line clip-path wipe.
4. Theme tokens — use these names and values; you may add tints but not new hues:
   graphite-950 #0B0E12  deepest: marquee strip, process section, footer
   graphite-900 #111418  page base
   graphite-800 #15191F  hero panels
   graphite-700 #1A1F26  cards
   graphite-600 #232A33  raised surfaces, dividers on dark
   line #2A313B · line-strong #3A4250
   text #EDEFF2 · text-2 #C3C9D2 · text-3 #9AA3AF (lowest allowed for body text on dark)
   text-4 #6F7885 (metadata only, ≥ 14px)
   copper #D08A4E       primary: CTAs, highlights, progress, focus rings
   copper-hover #E09A5C
   copper-light #E7B386  copper text accents on dark
   copper-deep #9A5A26   copper text on light "paper" sections
   copper-tint #1E1712 with border #5A3E27  featured tiles and the CTA band
   steel #8FA0B5 · steel-deep #4A5568  secondary accent: icons, inactive nodes
   paper #F4F1EC · paper-2 #FAF8F4 · paper-line #DDD6CB · ink-on-paper #1A1F26 / #4A5260
   radii: chip 4 · control 4 · card 10 · large tile 14–16
   Buttons: copper fill with graphite-900 text (≈ 6.6:1). Never white text on copper.
5. Dark is the base, but reading-heavy content sits on light "paper" sections: the services grid,
   article and knowledge bodies, course/research detail text and long forms. Alternate dark and
   paper deliberately so the page has rhythm and long reading is comfortable.
6. Logo: the circuit-tree mark (branching lines ending in round nodes, rooted in a chevron). On dark,
   render it as line art in copper with copper-light and steel nodes. Also keep the original
   cyan→navy gradient version as an alternative — the company has not yet approved a colour change
   (open question OQ-16). The logo's motif — lines that branch and end in nodes — is the site's
   graphic language: use it for dividers, the value-chain diagram and background linework.
7. Do not invent facts. No client logos, no testimonials, no ratings, no case-study outcomes, no
   certificate numbers, no statistics beyond the ones given below. If a section would need those,
   leave it out. Demo records keep a visible «نمونه نمایشی» badge.
8. Accessibility WCAG 2.1 AA: text contrast ≥ 4.5:1 on graphite, on copper-tint and on paper,
   visible copper focus rings, keyboard-reachable everything, one H1 per page, no skipped heading
   levels.
9. prefers-reduced-motion: every animation has a designed static end state. Canvas/WebGL backgrounds
   render one still frame, counters show final values, marquees become a wrapped static list,
   scroll-linked effects are disabled, parallax is off.
10. Performance: the hero H1 is the LCP element and must be painted immediately — it may not start
    at opacity 0. Animate the eyebrow, lead, CTAs and decoration around it, or reveal the H1 with a
    short transform/clip that starts already visible. Animate only transform, opacity, clip-path and
    filter. Canvas backgrounds pause off-screen and when the tab is hidden, cap devicePixelRatio at
    2, and fall back to a static SVG on mobile and low-power devices. No WebGL on mobile.
11. Fully responsive: 360px phones, tablets, 1280–1440px desktops. Mobile gets simplified motion,
    not the same effects shrunk.

MOTION LANGUAGE (one coherent system)
- Easing: entrances cubic-bezier(0.22, 1, 0.36, 1); state changes cubic-bezier(0.65, 0, 0.35, 1).
- Durations: hover/press 150–200ms · UI state 250–350ms · section entrance 500–700ms · the whole
  hero intro ≤ 1.4s.
- Stagger 60–90ms between siblings.
- Scroll reveal ("Blur Fade"): once, at ~20% in view: opacity 0→1, translateY 20px→0, blur 6px→0.
- Light is copper: glows, rings and drawn lines are copper at low opacity on graphite, never neon.
- RTL-aware: things enter from the inline-start (right). Marquees enter at the inline-end (left)
  edge and travel toward the inline-start (right).
- Card hover: lift 2–4px, border shifts line → #5A3E27, a soft copper spotlight follows the cursor.
- No scroll-jacking, parallax ≤ 20px, no autoplay video, no sound.

REFERENCE COMPONENTS (21st.dev — recreate the look and motion in our palette and in RTL)
Hero backgrounds
- Sonar Grid — https://21st.dev/@n1m4mz/components/sonar-grid
  Dot-grid canvas; sonar rings expand where you tap; ambient pings; zero deps; still under reduced
  motion. Dots in line (#2A313B), rings in copper.
- Glow Horizon — https://21st.dev/@ahammed.bashar9/components/glow-horizon
  A horizon light band — here a warm copper band along the bottom of the hero.
- Hero Golden Spiral — https://21st.dev/@ncdai/components/hero-01
  Spiral geometry: «رشد» means growth; the value chain rides a golden spiral.
- Floating Paths — https://21st.dev/@bundui/components/floating-paths (CTA band, copper at low opacity)
- Grid Pattern / Dot Pattern — https://21st.dev/@dillionverma/components/grid-pattern ,
  https://21st.dev/@dillionverma/components/dot-pattern (inner page heroes, radial fade mask)
Text and numbers
- Text Loop — https://21st.dev/@chamaac/components/text-loop (WORD-level only)
- Blur Fade — https://21st.dev/@dillionverma/components/blur-fade (standard scroll reveal)
- Vertical Cut Reveal — https://21st.dev/@cnippet-dev/components/vertical-cut-reveal (LINE-level only)
- Draw Line Text — https://21st.dev/@paceui/components/draw-line-text (copper underline)
- Number Ticker — https://21st.dev/@dillionverma/components/number-ticker
- Number Flow — https://21st.dev/@barvian/components/number-flow (localised digits)
Sections
- Bento — https://21st.dev/@kinfe123/components/bento
- Bento Feature Grid — https://21st.dev/@ln-dev7/components/bento-01
- Feature Section with card gradient — https://21st.dev/@manuarora700/components/feature-section-with-card-gradient
- Features 8 — https://21st.dev/@meschacirung/components/features-8
- Grid Feature Cards — https://21st.dev/@efferd/components/grid-feature-cards
- Stats Bento — https://21st.dev/@uilayout.contact/components/stats-bento
- Vertical How It Works Timeline — https://21st.dev/@ln-dev7/components/how-it-works-02
- Marquee (RTL) — https://21st.dev/@diceui/components/marquee/marquee-rtl-demo
- Blurred Marquee — https://21st.dev/@grootstudio/components/blurred-marquee
- Shine Border — https://21st.dev/@dillionverma/components/shine-border (copper sweep)
- CTA 3 — https://21st.dev/@efferd/components/cta-3
- Large Name Footer — https://21st.dev/@arihantcodes_1f7b8c4d/components/large-name-footer
- Ruixen Gradient Footer — https://21st.dev/@ruixen.ui/components/ruixen-gradient-footer (copper glow)

HOME PAGE — section by section (use exactly this copy)

0. Demo notice: a slim graphite-950 strip with a copper-tint pill:
   «نسخه نمونه اولیه · داده‌ها نمایشی هستند». Dismissible.

1. Header (graphite-900): copper line-art logo, «رشدآفرینان» / «صنعت و معدن», the six main nav items,
   search, «ورود / ثبت‌نام», and the copper CTA «درخواست امکان‌سنجی» with a Shine Border sweep every
   ~6s. Sticky; after 24px of scroll: graphite-900 at 85% with backdrop blur and a line hairline.
   Nav underline grows from the inline-start in copper on hover.

2. Hero — dark graphite. Produce TWO background options so the owner can choose:
   (i) Sonar Grid: dim dots, copper rings from a point behind the value-chain panel;
   (ii) Glow Horizon: a copper light band along the bottom with sparse dots above.
   Copy (the full H1 stays in the DOM as the accessible text):
     eyebrow (copper): «رشدآفرینان صنعت و معدن»
     H1 (Kufi): «از ایده تا امکان‌سنجی، پژوهش و مسیر سرمایه‌گذاری» — «امکان‌سنجی» in copper with a
       Draw Line copper underline. Optional: after «از ایده تا», a WORD-level Text Loop through
       «امکان‌سنجی» → «پژوهش» → «تأمین مالی» → «سرمایه‌گذاری».
     lead (text-3): «رشدآفرینان صنعت و معدن؛ پلتفرم تخصصی آموزش، پژوهش، مشاوره، امکان‌سنجی و اتصال
       به فرصت‌های سرمایه‌گذاری.»
     CTAs: «درخواست امکان‌سنجی» (copper) · «مشاهده فرصت‌های سرمایه‌گذاری» (outline line-strong)
   Stats row under a hairline (only these facts):
     «+۵۰ کارشناس» — Number Ticker 0→50, Persian digits
     «۳ حوزه فعالیت» — ticker 0→3
     «۱۳۸۸ آغاز» — a year: do not count it; reveal it with a copper Draw Line underline
   Value-chain panel (graphite-800 card, inline-end side = left on desktop):
     title «مسیر حرفه‌ای در پلتفرم». Eight nodes along a golden-spiral curve in the logo's
     line-and-node style: آموزش → دانش → پژوهش → امکان‌سنجی → پروژه → تأمین مالی → سرمایه‌گذاری →
     ایران سهامدار. The path draws itself; nodes light up in sequence (90ms stagger); completed
     segment copper, remaining segment line-strong. «امکان‌سنجی» and «ایران سهامدار» are larger
     copper nodes with a copper-tint halo and a slow pulse. Mobile: a vertical list with a drawn line.

3. Experience strip (graphite-950): label «حوزه‌های تجربه» in copper, then an RTL marquee with
   blurred edges and small copper diamond separators, pause on hover/focus. Real résumé sectors only:
   کاشی · فولاد · بتن · سنگ مصنوعی · پرورش میگو · حمل‌ونقل ریلی · معدن · مجتمع‌های تفریحی و اقامتی ·
   هتل · گلخانه · تجهیزات آزمایشگاهی · واحدهای صنعتی

4. «چهار مسیر اصلی» — Bento. «امکان‌سنجی» is the large featured tile (copper-tint + #5A3E27 border,
   copper icon); the others are graphite-700 tiles with steel icons:
     آموزش — «آموزش تخصصی سرمایه‌گذاری، اقتصاد، امکان‌سنجی و تأمین مالی»
     امکان‌سنجی — «از ایده اولیه تا مطالعات امکان‌سنجی و طرح توجیهی»
     پژوهش — «مطالعات اقتصادی، صنعتی، مالی و توسعه‌ای»
     ایران سهامدار — «معرفی پروژه‌ها و ارتباط با زیرساخت سرمایه‌گذاری»
   Ordinal (۰۱…۰۴), title, description, «ورود به مسیر ‹». Copper spotlight on hover, Shine Border
   on focus, a small line-art motif per tile in the logo's style (no stock photos).

5. «گروهی تخصصی در آموزش، پژوهش و مشاوره» — Stats Bento: the three stats (+۵۰ in copper), a chips
   card for «مهندسی · اقتصاد · مدیریت · حقوق · بیمه · مالیات · فناوری اطلاعات», and a credentials
   card, text only, no logos or numbers:
     مجوز واحد فنی-مهندسی از اداره کل صنعت، معدن و تجارت استان یزد
     عضویت در انجمن خدمات فنی و مهندسی استان یزد
     مجوز فعالیت از سازمان فنی و حرفه‌ای
     عضویت در کانون مشاوران اعتباری و سرمایه‌گذاری بانکی
     عضویت در انجمن IT استان یزد
   note: «شماره‌ها و جزئیات مدارک پس از دریافت و تأیید نسخه رسمی منتشر می‌شوند.»

6. «خدمات تخصصی» — a light PAPER section. A connected 3×2 grid with paper-line hairlines, copper-deep
   line icons, ink-on-paper text, staggered Blur Fade:
     مشاوره سرمایه‌گذاری — «بررسی گزینه‌های سرمایه‌گذاری و همراهی در تصمیم‌گیری بر پایه مطالعات کارشناسی.»
     مشاوره تأمین مالی — «شناخت روش‌های تأمین مالی متناسب با مرحله و ساختار پروژه.»
     مشاوره اقتصادی — «تحلیل‌های اقتصادی برای سازمان‌ها، طرح‌ها و سیاست‌گذاری.»
     مشاوره امکان‌سنجی — «ارزیابی فنی، بازار و مالی ایده پیش از ورود به اجرا.»
     مشاوره سرمایه‌گذاری صنعتی — «همراهی در طرح‌های صنعتی و معدنی از مطالعه تا ساختاردهی.»
     مشاوره پروژه — «پشتیبانی کارشناسی در برنامه‌ریزی و کنترل مراحل پروژه.»

7. Catalog previews on graphite: «طرح‌های در حال مطالعه», «دوره‌های آموزشی», «پژوهش‌های منتخب»,
   «مطالب دانشنامه», «پیش‌نمایش پروژه‌ها». graphite-700 cards, image zoom 1.04 on hover, staggered
   reveal, «نمونه نمایشی» badge on demo items, copper-tinted skeleton shimmer, a designed empty state.
   Neutral placeholder imagery or line-art only — never fake photos of people.

8. «از ثبت درخواست تا تحویل» — graphite-950, scroll-linked. Horizontal on desktop, vertical on mobile;
   a copper progress rail fills as the section scrolls; each node fills copper when reached:
     ثبت درخواست — «ثبت اطلاعات اولیه ایده یا پروژه»
     بررسی اولیه — «ارزیابی درخواست و تعیین دامنه خدمت»
     اجرای خدمت — «انجام مطالعه یا مشاوره توسط تیم متخصص»
     کنترل کارشناس — «بازبینی کیفیت و صحت خروجی‌ها»
     تحویل — «تحویل گزارش و جلسه جمع‌بندی»
   CTA: «شروع با ثبت درخواست امکان‌سنجی».

9. «قابلیت‌های توسعه آینده» — clearly NOT available. Dimmed graphite-700 cards, steel icons, a lock
   glyph and a «به‌زودی» badge, a slow shimmer:
     دستیار هوشمند (AI Assistant) · تحلیل هوشمند اسناد · محاسبات مالی · داشبورد سرمایه‌گذاری ·
     توکنایز کردن دارایی‌های واقعی
   note: «این قابلیت‌ها در نقشه راه توسعه پلتفرم قرار دارند و در نسخه فعلی ارائه نمی‌شوند.»

10. Final CTA — a copper-tint band (#1E1712, border #5A3E27) with Floating Paths in copper at low
    opacity: eyebrow «گفت‌وگوی اولیه رایگان است» (copper-light), H2 «طرح یا پرسشی دارید؟ با
    کارشناسان ما در ارتباط باشید.», buttons «درخواست مشاوره» (copper, Shine Border) and «ثبت پروژه
    برای امکان‌سنجی» (outline).

11. Footer (graphite-950): columns — about, «دسترسی سریع», «خدمات», «تماس» (address, postal code,
    phone, email), socials, «فرم تماس با ما», «پیگیری درخواست», copyright with the Jalali year.
    Under them, a huge outlined «رشدآفرینان» wordmark in Kufi (stroke line-strong) that fills to copper
    on reveal, with a Ruixen-style blurred copper glow rising from the floor (zero-dep SVG).

INNER PAGES
- PageHero: graphite, ≈40vh desktop, Dot Pattern with a radial fade and one faint copper sonar ping,
  breadcrumb, copper eyebrow, Kufi H1 and lead revealed word-level with Blur Fade.
- Listing pages (training, research, investment, knowledge, articles): graphite; filter chips with a
  copper active indicator that slides between chips; card grids with staggered reveal; skeletons.
- Detail pages: header area on graphite, body text on PAPER for reading; a sticky side card (facts,
  CTA) and a thin copper reading-progress bar under the header.
- Forms (feasibility request, contact): on PAPER; long forms feel like a stepper with a copper progress
  line; copper focus rings; Persian inline validation; a success state with a check mark that draws.
- The staff/user dashboard is OUT OF SCOPE — only apply the tokens.

DELIVERABLES
1. Home with both hero backgrounds (i) Sonar Grid and (ii) Glow Horizon, desktop 1440 and mobile 390.
2. Inner-page templates: a listing (آموزش), a detail (a course) and a form (درخواست امکان‌سنجی),
   desktop and mobile.
3. The shared Header (including its scrolled state) and Footer.
4. A "Motion spec" page: every animation — trigger, property, duration, easing, stagger, and its
   reduced-motion state.
5. A component inventory: each new component, which 21st.dev reference it adapts, and what changed
   for RTL and the Copper & Graphite theme.
6. A token sheet showing every colour above with its contrast ratio against the surfaces it is used on.
Keep the existing handoff file names (Home.dc.html, Training.dc.html, …) so our route mapping applies.

DO NOT
- invent logos, testimonials, clients, ratings, figures or certificate numbers;
- animate Persian text per character, or use typewriter effects on Persian;
- put long reading text on graphite — use paper;
- use neon, rainbow or blue glows — light in this theme is copper;
- use scroll-jacking, heavy parallax, autoplaying video or sound;
- ship WebGL or particle canvases on mobile;
- use English or lorem-ipsum placeholder copy;
- change routes, navigation labels or the order of the home-page sections without saying why.
```

---

## پیام‌های پیگیری (بعد از خروجی اول، یکی‌یکی)

**۱. انتخاب پس‌زمینه‌ی hero:**

```text
Go with hero background [(i) Sonar Grid / (ii) Glow Horizon]. Remove the other one from the handoff,
and reuse the chosen treatment, scaled down, for the inner-page PageHero.
```

**۲. بقیه‌ی صفحات عمومی:**

```text
Now apply the same system to: درباره ما, خدمات/مشاوره, امکان‌سنجی, پژوهش, فرصت‌های سرمایه‌گذاری,
ایران سهامدار, دانشنامه, مقالات, تماس, پیگیری درخواست, ورود/ثبت‌نام, جست‌وجو. Reuse the PageHero,
card, chip, paper-section and form patterns; do not introduce new colours or motion vocabulary.
```

**۳. کنترل کیفیت قبل از handoff:**

```text
Before exporting, check every page: no per-character animation on Persian text; every animation has
a reduced-motion state; the H1 is painted immediately; text contrast ≥ 4.5:1 on graphite,
copper-tint and paper; no white text on copper; long reading only on paper; RTL mirroring of arrows,
marquees and slide-ins; no invented facts. List anything you had to compromise on.
```
