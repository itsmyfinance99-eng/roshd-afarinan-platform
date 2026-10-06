/**
 * DEVELOPMENT ONLY — the sample general questionnaire of the feasibility platform (ST-35.04),
 * shown with «نمونه نمایشی» until the feasibility officer writes the real ones (OQ-36). Its
 * sections follow the usual structure of a feasibility report: the applicant's record, the
 * shareholders, the management, the permits, and the product and the project.
 */
export const DEMO_QUESTIONNAIRE_TITLE = 'پرسشنامه عمومی طرح توجیهی';

const text = (key: string, label: string, extra: object = {}) => ({
  key,
  type: 'text' as const,
  label,
  ...extra,
});
const column = (key: string, label: string, extra: object = {}) => ({
  key,
  type: 'text' as const,
  label,
  ...extra,
});

export const DEMO_QUESTIONNAIRE_DEFINITION = {
  sections: [
    {
      key: 'registration',
      title: 'سوابق ثبتی شرکت',
      description: 'سوابق ثبتی متقاضی طرح، اعم از شخصیت حقیقی یا حقوقی.',
      questions: [
        text('company_name', 'نام کامل شرکت', { required: true }),
        {
          key: 'company_type',
          type: 'single_choice' as const,
          label: 'نوع شرکت',
          required: true,
          options: [
            { value: 'public', label: 'سهامی عام' },
            { value: 'private', label: 'سهامی خاص' },
            { value: 'limited', label: 'مسئولیت محدود' },
            { value: 'cooperative', label: 'تعاونی' },
            { value: 'other', label: 'سایر' },
          ],
        },
        { key: 'registered_on', type: 'date' as const, label: 'تاریخ ثبت' },
        text('registration_no', 'شماره و محل ثبت'),
        {
          key: 'initial_capital',
          type: 'number' as const,
          label: 'سرمایه اولیه ثبت‌شده',
          unit: 'میلیون ریال',
          min: '0',
        },
        {
          key: 'current_capital',
          type: 'number' as const,
          label: 'سرمایه فعلی شرکت',
          unit: 'میلیون ریال',
          min: '0',
        },
        text('head_office', 'محل دفتر مرکزی'),
        {
          key: 'activity',
          type: 'long_text' as const,
          label: 'موضوع فعالیت',
          help: 'بر اساس آخرین اساسنامه یا آگهی تغییرات؛ اگر با موضوع طرح یکسان نیست، توضیح دهید.',
          required: true,
        },
        {
          key: 'legal_changes',
          type: 'long_text' as const,
          label: 'تغییرات قانونی ثبت‌شده',
          help: 'با تاریخ آگهی و نوع تغییر: سرمایه، سهامداران و مدیران، محل یا نوع شرکت.',
        },
      ],
    },
    {
      key: 'shareholders',
      title: 'سرمایه و سهامداران',
      questions: [
        {
          key: 'shareholder_list',
          type: 'table' as const,
          label: 'مشخصات سهامداران',
          required: true,
          minRows: 1,
          columns: [
            column('name', 'نام سهامدار', { required: true }),
            {
              key: 'shares',
              type: 'number' as const,
              label: 'تعداد سهام',
              integer: true,
              min: '0',
            },
            {
              key: 'share_type',
              type: 'single_choice' as const,
              label: 'نوع سهام',
              options: [
                { value: 'registered', label: 'با نام' },
                { value: 'bearer', label: 'بی‌نام' },
                { value: 'preferred', label: 'ممتاز' },
              ],
            },
            {
              key: 'percent',
              type: 'number' as const,
              label: 'درصد از کل',
              unit: 'درصد',
              min: '0',
              max: '100',
            },
          ],
        },
        {
          key: 'paid_capital_note',
          type: 'long_text' as const,
          label: 'سرمایه پرداخت‌شده و تعهدشده',
          help: 'آخرین سرمایه شرکت و نحوه تسهیم آن.',
        },
      ],
    },
    {
      key: 'management',
      title: 'مدیریت',
      description: 'سوابق علمی و تجربی اعضای هیئت‌مدیره و مدیرعامل، بر اساس آخرین آگهی تغییرات.',
      questions: [
        {
          key: 'board',
          type: 'table' as const,
          label: 'اعضای هیئت‌مدیره و مدیرعامل',
          required: true,
          minRows: 1,
          columns: [
            column('name', 'نام و نام خانوادگی', { required: true }),
            column('position', 'سمت', { required: true }),
            { key: 'appointed_on', type: 'date' as const, label: 'تاریخ انتصاب' },
            column('degree', 'درجه و رشته تحصیلی'),
            column('expertise', 'نوع تخصص'),
          ],
        },
        {
          key: 'execution_team',
          type: 'long_text' as const,
          label: 'ساختار اجرای طرح',
          help: 'مدیران اجرایی، مشاوران و پیمانکاران طرح، تا جایی که مشخص است.',
        },
      ],
    },
    {
      key: 'permits',
      title: 'مجوزهای قانونی',
      questions: [
        {
          key: 'permits_held',
          type: 'table' as const,
          label: 'مجوزهای گرفته‌شده',
          columns: [
            column('name', 'نام مجوز', { required: true }),
            column('issuer', 'سازمان صادرکننده'),
            column('number', 'شماره'),
            { key: 'issued_on', type: 'date' as const, label: 'تاریخ' },
          ],
        },
        {
          key: 'permits_needed',
          type: 'table' as const,
          label: 'مجوزهای مورد نیاز',
          columns: [
            column('name', 'نام مجوز', { required: true }),
            column('issuer', 'سازمان صادرکننده'),
            column('expected', 'زمان پیش‌بینی‌شده دریافت'),
          ],
        },
      ],
    },
    {
      key: 'project',
      title: 'محصول و طرح',
      questions: [
        {
          key: 'product',
          type: 'long_text' as const,
          label: 'معرفی محصول یا خدمت',
          help: 'مشخصات، کاربردها و استانداردهای محصول.',
          required: true,
        },
        {
          key: 'capacity',
          type: 'number' as const,
          label: 'ظرفیت اسمی سالانه',
          units: ['تن', 'مترمکعب', 'دستگاه', 'عدد'],
          min: '0',
          required: true,
        },
        {
          key: 'project_goals',
          type: 'multiple_choice' as const,
          label: 'ضرورت اجرای طرح',
          options: [
            { value: 'export', label: 'هدف صادراتی' },
            { value: 'import_substitution', label: 'جایگزینی واردات' },
            { value: 'new_technology', label: 'فناوری جدید' },
            { value: 'consumption', label: 'تغییر الگوی مصرف' },
          ],
        },
        {
          key: 'location_reason',
          type: 'long_text' as const,
          label: 'محل اجرا و دلایل انتخاب آن',
          help: 'دسترسی به مواد اولیه، بازار مصرف، نیروی انسانی، آب، برق و راه.',
        },
      ],
    },
  ],
  documents: [
    { key: 'articles', label: 'اساسنامه و آخرین آگهی تغییرات شرکت', required: true },
    { key: 'permits', label: 'تصویر مجوزهای گرفته‌شده' },
    { key: 'resumes', label: 'سوابق اعضای هیئت‌مدیره و مدیرعامل' },
  ],
};
