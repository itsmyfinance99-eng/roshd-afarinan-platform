/**
 * Roshd Afarinan — mock data (DEMO ONLY).
 * Isolated from UI. Replace with repositories/API later.
 * Every project/course/article here is sample content.
 *
 * @typedef {{key:string,label:string,href:string}} NavItem
 * @typedef {{id:string,title:string,category:string,sector:string,location:string,stage:string,service:string}} Project
 * @typedef {{id:string,title:string,category:string,instructor:string,level:string,duration:string,free:boolean}} Course
 * @typedef {{id:string,title:string,summary:string,category:string,date:string}} Entry
 */
(function () {
  const nav = [
    { key: 'home', label: 'صفحه اصلی', href: 'Home.dc.html' },
    { key: 'training', label: 'آموزش', href: 'Training.dc.html' },
    { key: 'feasibility', label: 'امکان‌سنجی', href: 'Feasibility.dc.html' },
    { key: 'research', label: 'پژوهش', href: 'Research.dc.html' },
    { key: 'services', label: 'مشاوره', href: 'Services.dc.html' },
    { key: 'investment', label: 'فرصت‌های سرمایه‌گذاری', href: 'Investment.dc.html' },
    { key: 'sahamdar', label: 'ایران سهامدار', href: 'Iran Sahamdar.dc.html' },
    { key: 'knowledge', label: 'دانشنامه', href: 'Knowledge.dc.html' },
    { key: 'articles', label: 'مقالات', href: 'Articles.dc.html' },
    { key: 'about', label: 'درباره ما', href: 'About.dc.html' },
    { key: 'contact', label: 'تماس با ما', href: 'Contact.dc.html' },
  ];

  const journeys = [
    { key: 'training', n: '۱', title: 'آموزش', desc: 'آموزش تخصصی سرمایه‌گذاری، اقتصاد، امکان‌سنجی و تأمین مالی', href: 'Training.dc.html', img: 'تصویر کلاس / کارگاه آموزشی' },
    { key: 'feasibility', n: '۲', title: 'امکان‌سنجی', desc: 'از ایده اولیه تا مطالعات امکان‌سنجی و طرح توجیهی', href: 'Feasibility.dc.html', img: 'تصویر سایت صنعتی / نقشه طرح' },
    { key: 'research', n: '۳', title: 'پژوهش', desc: 'مطالعات اقتصادی، صنعتی، مالی و توسعه‌ای', href: 'Research.dc.html', img: 'تصویر گزارش پژوهشی / داده' },
    { key: 'sahamdar', n: '۴', title: 'ایران سهامدار', desc: 'معرفی پروژه‌ها و ارتباط با زیرساخت سرمایه‌گذاری', href: 'Iran Sahamdar.dc.html', img: 'تصویر پروژه معدنی / کارخانه' },
  ];

  const pathSteps = ['آموزش', 'دانش', 'پژوهش', 'امکان‌سنجی', 'پروژه', 'تأمین مالی', 'سرمایه‌گذاری', 'ایران سهامدار'];

  const stats = [
    { value: '+۵۰', label: 'کارشناس', detail: 'در حوزه‌های مهندسی، اقتصاد، مدیریت، حقوق، بیمه، مالیات و فناوری اطلاعات' },
    { value: '۳', label: 'حوزه اصلی فعالیت', detail: 'آموزش، پژوهش و مشاوره' },
    { value: '۱۳۸۸', label: 'آغاز فعالیت', detail: 'سابقه فعالیت حرفه‌ای از سال ۱۳۸۸' },
  ];

  const expertise = ['مهندسی', 'اقتصاد', 'مدیریت', 'حقوق', 'بیمه', 'مالیات', 'فناوری اطلاعات'];

  const services = [
    { id: 's1', title: 'مشاوره سرمایه‌گذاری', desc: 'بررسی گزینه‌های سرمایه‌گذاری و همراهی در تصمیم‌گیری بر پایه مطالعات کارشناسی.' },
    { id: 's2', title: 'مشاوره تأمین مالی', desc: 'شناخت روش‌های تأمین مالی متناسب با مرحله و ساختار پروژه.' },
    { id: 's3', title: 'مشاوره اقتصادی', desc: 'تحلیل‌های اقتصادی برای سازمان‌ها، طرح‌ها و سیاست‌گذاری.' },
    { id: 's4', title: 'مشاوره امکان‌سنجی', desc: 'ارزیابی فنی، بازار و مالی ایده پیش از ورود به اجرا.' },
    { id: 's5', title: 'مشاوره سرمایه‌گذاری صنعتی', desc: 'همراهی در طرح‌های صنعتی و معدنی از مطالعه تا ساختاردهی.' },
    { id: 's6', title: 'مشاوره پروژه', desc: 'پشتیبانی کارشناسی در برنامه‌ریزی و کنترل مراحل پروژه.' },
  ];

  const projects = [
    { id: 'p1', title: 'طرح نمونه واحد فرآوری سنگ آهن', category: 'معدنی', sector: 'mining', location: 'کرمان', stage: 'ایده اولیه', service: 'مطالعات امکان‌سنجی' },
    { id: 'p2', title: 'طرح نمونه تولید قطعات صنعتی', category: 'صنعتی', sector: 'industry', location: 'اصفهان', stage: 'طرح توجیهی', service: 'مشاوره تأمین مالی' },
    { id: 'p3', title: 'طرح نمونه نیروگاه خورشیدی کوچک', category: 'انرژی', sector: 'energy', location: 'یزد', stage: 'مطالعه بازار', service: 'امکان‌سنجی فنی و مالی' },
    { id: 'p4', title: 'طرح نمونه مجتمع بسته‌بندی محصولات کشاورزی', category: 'کشاورزی و غذایی', sector: 'agri', location: 'خراسان رضوی', stage: 'ایده اولیه', service: 'طرح توجیهی' },
    { id: 'p5', title: 'طرح نمونه توسعه معدن سنگ ساختمانی', category: 'معدنی', sector: 'mining', location: 'لرستان', stage: 'مطالعه فنی', service: 'مشاوره سرمایه‌گذاری صنعتی' },
    { id: 'p6', title: 'طرح نمونه مرکز لجستیک منطقه‌ای', category: 'خدمات و زیرساخت', sector: 'infra', location: 'قزوین', stage: 'طرح توجیهی', service: 'مشاوره پروژه' },
  ];

  const sectors = [
    { key: 'all', label: 'همه' },
    { key: 'mining', label: 'معدنی' },
    { key: 'industry', label: 'صنعتی' },
    { key: 'energy', label: 'انرژی' },
    { key: 'agri', label: 'کشاورزی و غذایی' },
    { key: 'infra', label: 'خدمات و زیرساخت' },
  ];

  const courses = [
    { id: 'c1', title: 'مبانی امکان‌سنجی طرح‌های صنعتی', category: 'امکان‌سنجی', instructor: 'مدرس نمونه', level: 'مقدماتی', duration: '۱۲ ساعت', free: false },
    { id: 'c2', title: 'آشنایی با روش‌های تأمین مالی پروژه', category: 'تأمین مالی', instructor: 'مدرس نمونه', level: 'متوسط', duration: '۸ ساعت', free: false },
    { id: 'c3', title: 'اقتصاد برای مدیران', category: 'اقتصاد', instructor: 'مدرس نمونه', level: 'مقدماتی', duration: '۶ ساعت', free: true },
    { id: 'c4', title: 'ارزیابی مالی طرح‌های سرمایه‌گذاری', category: 'سرمایه‌گذاری', instructor: 'مدرس نمونه', level: 'پیشرفته', duration: '۱۶ ساعت', free: false },
    { id: 'c5', title: 'تدوین طرح توجیهی', category: 'امکان‌سنجی', instructor: 'مدرس نمونه', level: 'متوسط', duration: '۱۰ ساعت', free: false },
    { id: 'c6', title: 'آشنایی با بازار سرمایه', category: 'سرمایه‌گذاری', instructor: 'مدرس نمونه', level: 'مقدماتی', duration: '۴ ساعت', free: true },
  ];

  const research = [
    { id: 'r1', title: 'نمونه: بررسی زنجیره ارزش فولاد', summary: 'مطالعه‌ای نمونه درباره حلقه‌های زنجیره ارزش و گلوگاه‌های آن.', category: 'صنعتی', date: '۱۴۰۵/۰۵/۱۲' },
    { id: 'r2', title: 'نمونه: الگوهای تأمین مالی طرح‌های معدنی', summary: 'مرور نمونه روش‌های رایج تأمین مالی در طرح‌های معدنی.', category: 'مالی', date: '۱۴۰۵/۰۴/۲۸' },
    { id: 'r3', title: 'نمونه: شاخص‌های توسعه منطقه‌ای', summary: 'چارچوبی نمونه برای سنجش آمادگی مناطق برای سرمایه‌گذاری.', category: 'توسعه‌ای', date: '۱۴۰۵/۰۳/۱۵' },
    { id: 'r4', title: 'نمونه: تحلیل بازار مصالح ساختمانی', summary: 'بررسی نمونه عرضه و تقاضا در بازار مصالح.', category: 'اقتصادی', date: '۱۴۰۵/۰۲/۰۹' },
  ];

  const knowledge = [
    { id: 'k1', title: 'امکان‌سنجی چیست؟', summary: 'تعریف، مراحل و خروجی‌های یک مطالعه امکان‌سنجی.', category: 'امکان‌سنجی', date: '۱۴۰۵/۰۶/۰۲' },
    { id: 'k2', title: 'طرح توجیهی', summary: 'اجزای اصلی طرح توجیهی و تفاوت آن با امکان‌سنجی.', category: 'امکان‌سنجی', date: '۱۴۰۵/۰۵/۲۰' },
    { id: 'k3', title: 'نرخ بازده داخلی (IRR)', summary: 'مفهوم و کاربرد نرخ بازده داخلی در ارزیابی طرح‌ها.', category: 'مالی', date: '۱۴۰۵/۰۵/۰۱' },
    { id: 'k4', title: 'تأمین مالی پروژه', summary: 'آشنایی با ساختار تأمین مالی مبتنی بر پروژه.', category: 'تأمین مالی', date: '۱۴۰۵/۰۴/۱۸' },
    { id: 'k5', title: 'ارزش فعلی خالص (NPV)', summary: 'روش محاسبه و تفسیر ارزش فعلی خالص.', category: 'مالی', date: '۱۴۰۵/۰۴/۰۳' },
    { id: 'k6', title: 'توکنایز کردن دارایی', summary: 'مفهوم پایه‌ای بازنمایی دیجیتال دارایی‌های واقعی.', category: 'فناوری', date: '۱۴۰۵/۰۳/۲۲' },
  ];

  const articles = [
    { id: 'a1', title: 'نمونه مقاله: نقش امکان‌سنجی در کاهش ریسک', summary: 'چرا مطالعه پیش از اجرا اهمیت دارد.', category: 'امکان‌سنجی', date: '۱۴۰۵/۰۶/۱۸' },
    { id: 'a2', title: 'نمونه مقاله: انتخاب روش تأمین مالی', summary: 'معیارهای انتخاب روش مناسب تأمین مالی.', category: 'تأمین مالی', date: '۱۴۰۵/۰۶/۰۴' },
    { id: 'a3', title: 'نمونه مقاله: آموزش سرمایه‌گذاری برای مدیران', summary: 'مفاهیمی که مدیران باید بشناسند.', category: 'آموزش', date: '۱۴۰۵/۰۵/۲۷' },
    { id: 'a4', title: 'نمونه مقاله: داده در تصمیم‌گیری صنعتی', summary: 'استفاده از داده در مطالعات صنعتی.', category: 'پژوهش', date: '۱۴۰۵/۰۵/۱۰' },
    { id: 'a5', title: 'نمونه مقاله: خطاهای رایج در طرح توجیهی', summary: 'اشتباهاتی که در تدوین طرح توجیهی تکرار می‌شوند.', category: 'امکان‌سنجی', date: '۱۴۰۵/۰۴/۲۹' },
    { id: 'a6', title: 'نمونه مقاله: مسیر از پژوهش تا پروژه', summary: 'پیوند مطالعات پژوهشی با تعریف پروژه.', category: 'پژوهش', date: '۱۴۰۵/۰۴/۱۱' },
  ];

  const process = [
    { n: '۱', title: 'ثبت درخواست', desc: 'ثبت اطلاعات اولیه ایده یا پروژه' },
    { n: '۲', title: 'بررسی اولیه', desc: 'ارزیابی درخواست و تعیین دامنه خدمت' },
    { n: '۳', title: 'اجرای خدمت', desc: 'انجام مطالعه یا مشاوره توسط تیم متخصص' },
    { n: '۴', title: 'کنترل کارشناس', desc: 'بازبینی کیفیت و صحت خروجی‌ها' },
    { n: '۵', title: 'تحویل', desc: 'تحویل گزارش و جلسه جمع‌بندی' },
  ];

  const future = [
    { title: 'دستیار هوشمند (AI Assistant)', desc: 'پاسخ‌گویی و راهنمایی در مسیر آموزش و امکان‌سنجی' },
    { title: 'تحلیل هوشمند اسناد', desc: 'استخراج نکات کلیدی از گزارش‌ها و مدارک' },
    { title: 'محاسبات مالی', desc: 'ابزارهای محاسبه شاخص‌های ارزیابی طرح' },
    { title: 'داشبورد سرمایه‌گذاری', desc: 'پیگیری وضعیت پروژه‌ها و درخواست‌ها' },
    { title: 'توکنایز کردن دارایی‌های واقعی', desc: 'بازنمایی دیجیتال دارایی‌های واقعی در آینده' },
  ];

  const faq = [
    { q: 'امکان‌سنجی چه مدت زمان می‌برد؟', a: 'مدت زمان به دامنه و پیچیدگی طرح بستگی دارد و پس از بررسی اولیه اعلام می‌شود.' },
    { q: 'برای ثبت درخواست چه اطلاعاتی لازم است؟', a: 'شرح کوتاه ایده، حوزه فعالیت، محل اجرا و مرحله فعلی طرح کافی است.' },
    { q: 'آیا فرصت‌های نمایش‌داده‌شده واقعی هستند؟', a: 'خیر. در این نسخه نمونه، همه پروژه‌ها و فرصت‌ها نمایشی هستند.' },
    { q: 'ارتباط با ایران سهامدار چگونه است؟', a: 'جزئیات اتصال در مراحل بعدی توسعه مشخص می‌شود و در این نمونه شبیه‌سازی نشده است.' },
  ];

  // Résumé sectors only — no client names or outcomes.
  const experience = ['کاشی', 'فولاد', 'بتن', 'سنگ مصنوعی', 'پرورش میگو', 'حمل‌ونقل ریلی', 'معدن', 'مجتمع‌های تفریحی و اقامتی', 'هتل', 'گلخانه', 'تجهیزات آزمایشگاهی', 'واحدهای صنعتی'];

  // Text only; numbers and documents published after official confirmation.
  const credentials = [
    'مجوز واحد فنی-مهندسی از اداره کل صنعت، معدن و تجارت استان یزد',
    'عضویت در انجمن خدمات فنی و مهندسی استان یزد',
    'مجوز فعالیت از سازمان فنی و حرفه‌ای',
    'عضویت در کانون مشاوران اعتباری و سرمایه‌گذاری بانکی',
    'عضویت در انجمن IT استان یزد',
  ];

  // Demo course-detail scaffolding (same for every demo course).
  const courseDetail = {
    about: 'این توضیح نمونه است و برای بررسی ساختار صفحه جزئیات دوره قرار گرفته است. شرح واقعی، سرفصل‌ها و زمان برگزاری پس از تأیید برنامه آموزشی جایگزین می‌شود.',
    outline: ['مفاهیم پایه و اصطلاحات', 'مراحل و روش‌های اصلی', 'بررسی یک طرح نمونه', 'تمرین کارگاهی', 'جمع‌بندی و پرسش و پاسخ'],
    audience: ['کارآفرینان صنعتی و معدنی', 'مدیران و کارشناسان طرح', 'سرمایه‌گذاران'],
  };

  window.RoshdData = { nav, journeys, pathSteps, stats, expertise, services, projects, sectors, courses, research, knowledge, articles, process, future, faq, experience, credentials, courseDetail };
})();
