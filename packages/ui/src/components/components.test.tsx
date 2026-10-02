import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Accordion } from './accordion';
import { Button, ButtonLink } from './button';
import { ChipGroup, Switch } from './chip';
import { DemoBadge, EmptyState } from './feedback';
import { FieldShell, TextInput } from './field';
import { PageHero } from './page-hero';
import { RevealWords } from './reveal-words';

describe('Button', () => {
  it('defaults to type=button and supports variants', () => {
    render(<Button variant="outline">ارسال</Button>);
    const button = screen.getByRole('button', { name: 'ارسال' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('border-primary');
  });

  it('renders links styled as buttons', () => {
    render(<ButtonLink href="/feasibility/request">درخواست امکان‌سنجی</ButtonLink>);
    expect(screen.getByRole('link', { name: 'درخواست امکان‌سنجی' })).toHaveAttribute(
      'href',
      '/feasibility/request',
    );
  });
});

describe('ChipGroup', () => {
  function Harness() {
    const [value, setValue] = useState<'all' | 'mining'>('all');
    return (
      <ChipGroup
        label="حوزه"
        value={value}
        onChange={setValue}
        options={[
          { value: 'all', label: 'همه' },
          { value: 'mining', label: 'معدنی' },
        ]}
      />
    );
  }

  it('exposes the selection with aria-pressed and updates on click', async () => {
    render(<Harness />);
    const mining = screen.getByRole('button', { name: 'معدنی' });
    expect(mining).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(mining);
    expect(mining).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'همه' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Accordion', () => {
  it('opens one panel at a time and wires aria attributes', async () => {
    render(
      <Accordion
        items={[
          { question: 'سؤال اول', answer: 'پاسخ اول' },
          { question: 'سؤال دوم', answer: 'پاسخ دوم' },
        ]}
      />,
    );
    const first = screen.getByRole('button', { name: /سؤال اول/ });
    const second = screen.getByRole('button', { name: /سؤال دوم/ });
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region')).toHaveTextContent('پاسخ اول');

    await userEvent.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region')).toHaveTextContent('پاسخ دوم');
  });
});

describe('Field', () => {
  it('links the error message to the input for screen readers', () => {
    render(
      <FieldShell id="email" label="ایمیل" required error="ایمیل معتبر نیست.">
        <TextInput id="email" error="ایمیل معتبر نیست." />
      </FieldShell>,
    );
    const input = screen.getByLabelText(/ایمیل/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'email-error');
    expect(screen.getByRole('alert')).toHaveTextContent('ایمیل معتبر نیست.');
  });
});

describe('feedback', () => {
  it('labels demo content', () => {
    render(<DemoBadge />);
    expect(screen.getByText('نمونه نمایشی')).toBeInTheDocument();
  });

  it('renders an empty state as a status region', () => {
    render(<EmptyState title="موردی یافت نشد" description="فیلترها را تغییر دهید." />);
    expect(screen.getByRole('status')).toHaveTextContent('موردی یافت نشد');
  });
});

describe('PageHero', () => {
  it('renders breadcrumbs with the current page marked', () => {
    render(
      <PageHero
        crumbs={[{ label: 'صفحه اصلی', href: '/' }, { label: 'آموزش' }]}
        title="آموزش تخصصی"
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'آموزش تخصصی' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'صفحه اصلی' })).toHaveAttribute('href', '/');
    expect(screen.getByText('آموزش', { selector: '[aria-current="page"]' })).toBeInTheDocument();
  });
});

describe('Switch', () => {
  function Harness() {
    const [on, setOn] = useState(false);
    return (
      <label>
        <Switch checked={on} onChange={setOn} />
        فقط رایگان
      </label>
    );
  }

  it('is a labelled switch that toggles', async () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'فقط رایگان' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
  });
});

describe('RevealWords', () => {
  it('splits by word only and keeps the text intact', () => {
    const { container } = render(
      <p>
        <RevealWords text="پیام خود را ثبت کنید؛ کارشناسان تماس می‌گیرند." />
      </p>,
    );
    expect(container.textContent).toBe('پیام خود را ثبت کنید؛ کارشناسان تماس می‌گیرند.');
    const words = container.querySelectorAll('.ra-w');
    expect(words).toHaveLength(8);
    // ZWNJ joins stay inside one word.
    expect(words[7]).toHaveTextContent('می‌گیرند.');
  });
});
