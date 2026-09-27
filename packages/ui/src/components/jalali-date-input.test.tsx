import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { JalaliDateInput } from './jalali-date-input';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <JalaliDateInput id="d" value={value} onChange={setValue} />
      <output data-testid="iso">{value}</output>
    </>
  );
}

const iso = () => screen.getByTestId('iso').textContent;

/** ST-27.05: the field shows Jalali and hands the API an ISO Gregorian day. */
describe('JalaliDateInput', () => {
  it('shows an existing value in Jalali with Persian digits', () => {
    render(<Harness initial="2026-09-27" />);
    expect(screen.getByRole('textbox')).toHaveValue('۱۴۰۵/۰۷/۰۵');
  });

  it('accepts a typed Jalali date and reports the ISO day', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByRole('textbox');
    await user.type(box, '۱۴۰۵/۰۷/۰۵{Enter}');
    expect(iso()).toBe('2026-09-27');
  });

  it('refuses a date that does not exist and keeps the value unchanged', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-09-27" />);
    const box = screen.getByRole('textbox');
    await user.clear(box);
    // 30 Esfand exists only in a leap year; 1404 is not one.
    await user.type(box, '۱۴۰۴/۱۲/۳۰{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('تاریخ معتبر نیست.');
    expect(iso()).toBe('2026-09-27');
  });

  it('clears the value when the box is emptied', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-09-27" />);
    const box = screen.getByRole('textbox');
    await user.clear(box);
    await user.tab();
    expect(iso()).toBe('');
  });

  it('picks a day from the calendar', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-09-27" />);
    await user.click(screen.getByRole('button', { name: 'انتخاب از تقویم' }));
    const dialog = screen.getByRole('dialog', { name: 'تقویم شمسی' });
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole('gridcell', { name: '۱۴۰۵/۰۷/۰۱' }));
    expect(iso()).toBe('2026-09-23');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('walks the grid with the arrow keys, RTL: left is forward', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-09-27" />);
    await user.click(screen.getByRole('button', { name: 'انتخاب از تقویم' }));
    // 5 Mehr is focused; ArrowLeft → 6 Mehr, ArrowDown → 13 Mehr.
    await user.keyboard('{ArrowLeft}{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(iso()).toBe('2026-10-05');
  });

  it('changes month with PageDown and closes with Escape', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-09-27" />);
    await user.click(screen.getByRole('button', { name: 'انتخاب از تقویم' }));
    await user.keyboard('{PageDown}');
    expect(screen.getByRole('grid', { name: /آبان/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks the selected day for assistive technology', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-09-27" />);
    await user.click(screen.getByRole('button', { name: 'انتخاب از تقویم' }));
    expect(screen.getByRole('gridcell', { name: '۱۴۰۵/۰۷/۰۵' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
