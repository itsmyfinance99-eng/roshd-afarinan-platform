# برنامه اجرایی: فاز ۰ و فاز ۱

> منبع: سند «Roadmap، معماری اجرایی و Promptهای Claude Code» (نسخه شروع پروژه).
> دامنه این برنامه: **فاز ۰ (Discovery و Foundation)** و **فاز ۱ (MVP وب‌سایت و Platform Core)**.
> منبع رسمی backlog فایل [`docs/backlog/backlog.yaml`](../backlog/backlog.yaml) است و با GitHub Issues همگام می‌شود.

## ۱. اصول اجرا

1. **هسته پایدار، سپس ماژول‌ها.** Identity، فایل، پرداخت، اعلان، Audit و RBAC یک بار ساخته می‌شوند و همه ماژول‌ها از آن‌ها استفاده می‌کنند.
2. **قابلیت سنگین را امروز اجرا نکن، اما جای آن را امروز در معماری مشخص کن.** امکان‌سنجی کامل، موتور مالی، ایران سهامدار، AI و بلاک‌چین در این دو فاز فقط Interface/Port دارند.
3. **هیچ قانون کسب‌وکاری حدس زده نمی‌شود.** هر ابهامی در [`open-questions.md`](open-questions.md) ثبت می‌شود.
4. **هر Story فقط زمانی Done است که با [Definition of Done](#۶-definition-of-done) منطبق باشد.**

## ۲. جریان کار Git (استاندارد تیم)

```text
main  ← فقط از طریق Release PR از develop (با tag نسخه)
  └─ develop  ← شاخه یکپارچه‌سازی؛ فقط از طریق PR
       ├─ feature/ST-xx.yy-slug
       ├─ fix/slug
       ├─ chore/slug
       └─ docs/slug
```

- برای هر Story یا گروه کوچک و مرتبطی از Storyها یک شاخه از `develop` ساخته می‌شود.
- قبل از commit و push، دستور `pnpm verify` (lint، typecheck، test و build) باید کاملاً سبز باشد.
- PR به `develop` با قالب استاندارد باز می‌شود و به Story لینک می‌شود (`Closes #N`). CI همان بررسی‌ها را روی GitHub تکرار می‌کند.
- پیام commitها از قالب Conventional Commits پیروی می‌کنند و commitlint آن را کنترل می‌کند.
- در پایان هر فاز یک Release PR از `develop` به `main` باز می‌شود و نسخه tag می‌خورد (`v0.1.0` برای فاز ۰ و `v0.2.0` برای فاز ۱).

## ۳. سیستم مدیریت پروژه

| ابزار                       | کاربرد                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `docs/backlog/backlog.yaml` | منبع رسمی EPIC، Story، امتیاز، اولویت و Sprint                                      |
| GitHub Issues               | هر EPIC و Story یک Issue است و Storyها در Issue اپیک به‌صورت checklist لینک می‌شوند |
| GitHub Milestones           | هر Sprint یک Milestone است. فازهای ۲ تا ۹ هم Milestone جداگانه دارند                |
| Labels                      | `type:*`، `priority:*`، `area:*`، `phase:*`، `status:*`                             |
| Issue templates             | Epic، Story، Bug، Task و Spike                                                      |
| PR template                 | خلاصه، تست‌ها، اسکرین‌شات، اثر روی migration/API/امنیت، چک‌لیست DoD                 |
| ADR                         | تصمیم‌های معماری در `docs/decisions`                                                |
| `pnpm backlog:sync`         | ساخت یا به‌روزرسانی idempotent labelها، milestoneها و issueها از روی backlog.yaml   |

## ۴. نقشه Sprintها (فاز ۰ و ۱)

| Sprint | فاز | هدف                        | EPICها                                               | خروجی قابل تحویل                                                                    |
| ------ | --- | -------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| S0     | ۰   | Discovery و معماری         | EPIC-01                                              | ADRها، معماری، open questions، backlog، حاکمیت مخزن                                 |
| S1     | ۰   | Foundation                 | EPIC-01، EPIC-02، EPIC-13، EPIC-19                   | Monorepo، CI، Docker، API skeleton، DB و migration، Auth و RBAC skeleton، Adapterها |
| S2     | ۱   | پایه UI                    | EPIC-04                                              | Layout، RTL، Design Tokens، کامپوننت‌های پایه، ناوبری موبایل                        |
| S3     | ۱   | وب‌سایت عمومی              | EPIC-04                                              | خانه، درباره ما، خدمات، تماس و صفحات چهار مسیر اصلی                                 |
| S4     | ۱   | CMS و SEO                  | EPIC-03، EPIC-05، EPIC-10، EPIC-20                   | صفحات، مقالات، دانشنامه، جست‌وجو، sitemap، JSON-LD                                  |
| S5     | ۱   | هسته کاربر                 | EPIC-02، EPIC-08، EPIC-13                            | ورود و ثبت‌نام، پروفایل، داشبورد پایه، فایل                                         |
| S6     | ۱   | آموزش و سفارش              | EPIC-06، EPIC-07                                     | کاتالوگ دوره، Order و PaymentAttempt، Payment abstraction                           |
| S7     | ۱   | پژوهش، مشاوره و درخواست‌ها | EPIC-09، EPIC-11، EPIC-12                            | پژوهش، ثبت درخواست خدمات، تیکت پایه                                                 |
| S8     | ۱   | فرصت‌ها و آماده‌سازی آینده | EPIC-16، EPIC-14، EPIC-15، EPIC-17، EPIC-18، EPIC-21 | کاتالوگ فرصت‌ها، skeleton ماژول‌های آینده، QA و انتشار v0.2.0                       |

## ۵. ترتیب اجرای شاخه‌ها

| #   | شاخه                                 | Storyها                                                 |
| --- | ------------------------------------ | ------------------------------------------------------- |
| 1   | `chore/project-governance`           | ST-01.01، ST-01.02 (مستندات، ADRها، backlog، قالب‌ها)   |
| 2   | `feature/ST-01.03-monorepo-tooling`  | Monorepo، TypeScript، ESLint، Prettier، commitlint، CI  |
| 3   | `feature/ST-01.05-api-foundation`    | NestJS، config، logging، خطا، envelope، health، Swagger |
| 4   | `feature/ST-01.08-database`          | Docker Compose، Prisma، migration اولیه، seed           |
| 5   | `feature/ST-02.01-auth-rbac`         | ثبت‌نام، ورود، توکن، RBAC، audit، rate limit            |
| 6   | `feature/ST-01.09-provider-ports`    | Adapterهای پرداخت، فایل، اعلان، جست‌وجو و Portهای آینده |
| 7   | `feature/ST-04.01-web-foundation`    | Next.js، RTL، فونت، tokens، پکیج UI، layout             |
| 8   | `feature/ST-04.x-public-pages`       | صفحات عمومی                                             |
| 9   | `feature/ST-03.x-cms`                | CMS API، SEO و sitemap                                  |
| 10  | `feature/ST-05.x-search`             | جست‌وجو                                                 |
| 11  | `feature/ST-08.x-user-core`          | ورود و ثبت‌نام در وب، داشبورد، پروفایل                  |
| 12  | `feature/ST-13.x-files`              | مدیریت فایل خصوصی                                       |
| 13  | `feature/ST-11.x-service-requests`   | درخواست امکان‌سنجی، پژوهش، مشاوره و تماس                |
| 14  | `feature/ST-12.x-tickets`            | تیکت پایه                                               |
| 15  | `feature/ST-07.x-orders-payments`    | Order، PaymentAttempt و callback idempotent             |
| 16  | `feature/ST-06.x-training-catalog`   | کاتالوگ آموزش                                           |
| 17  | `feature/ST-16.x-investment-catalog` | کاتالوگ فرصت‌ها و skeleton ماژول‌های آینده              |

## ۶. Definition of Done

یک Story فقط وقتی «تمام‌شده» است که:

- [ ] validation ورودی (Zod) و پیام خطای فارسی داشته باشد
- [ ] حالت‌های loading، empty، error و success در UI پوشش داده شده باشد
- [ ] authorization (و بررسی مالکیت برای منابع خصوصی) اعمال شده باشد
- [ ] رویدادهای حساس در Audit Log ثبت شوند
- [ ] تست خودکار داشته باشد: unit برای منطق دامنه، e2e برای API، و تست منفی برای دسترسی، پرداخت و فایل
- [ ] مستندات OpenAPI برای endpointها به‌روز باشد
- [ ] در موبایل، تبلت و دسکتاپ درست نمایش داده شود و RTL صحیح باشد
- [ ] صفحات عمومی metadata، canonical و structured data داشته باشند
- [ ] logging مناسب و بدون ثبت اطلاعات حساس داشته باشد
- [ ] دستور `pnpm verify` سبز باشد و CI روی PR پاس شود
- [ ] مستندات و ADR مرتبط به‌روز شده باشد

## ۷. آنچه در این دو فاز عمداً ساخته نمی‌شود

پرسشنامه هوشمند امکان‌سنجی، workflow کامل کارشناسی، موتور مالی، تحلیل حساسیت، داشبورد حرفه‌ای سرمایه‌گذار، اتصال واقعی ایران سهامدار، AI Assistant و تحلیل اسناد، توکن‌سازی و بلاک‌چین، اپلیکیشن موبایل، و اتصال واقعی درگاه پرداخت و پیامک. برای همه این موارد فقط **Interface/Port و مستندات** آماده می‌شود.

## ۸. ریسک‌ها

| ریسک                                      | اثر                   | اقدام                                                                 |
| ----------------------------------------- | --------------------- | --------------------------------------------------------------------- |
| نامشخص‌بودن مشخصات API ایران سهامدار      | تأخیر فاز ۶           | Mock Provider و contract test؛ هیچ endpointی حدس زده نمی‌شود          |
| انتخاب نشدن درگاه پرداخت و سرویس پیامک    | تأخیر فروش دوره و OTP | Adapter و Mock provider؛ تصمیم در open-questions                      |
| کمبود محتوای واقعی (دوره، پژوهش، فرصت)    | صفحات خالی            | Empty stateهای حرفه‌ای و داده نمایشی با برچسب «نمونه نمایشی»          |
| گسترش دامنه (scope creep)                 | عقب‌افتادن MVP        | اجرای سخت‌گیرانه فهرست «ساخته نمی‌شود» و بازبینی backlog در هر Sprint |
| الزامات حقوقی داده‌های مالی و کاربران     | ریسک انطباق           | ثبت در open-questions و جداکردن کامل «معرفی فرصت» از «تراکنش»         |
| میزبانی در ایران و دسترسی به CDNهای خارجی | خطا در build و اجرا   | فونت‌ها self-hosted و بدون وابستگی runtime به سرویس خارجی             |
