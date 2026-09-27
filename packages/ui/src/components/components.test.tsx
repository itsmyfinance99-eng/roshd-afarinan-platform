import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Accordion } from './accordion';
import { Button, ButtonLink } from './button';
import { ChipGroup } from './chip';
import { DemoBadge, EmptyState } from './feedback';
import { FieldShell, TextInput } from './field';
import { PageHero } from './page-hero';

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
