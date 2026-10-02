"""
Independent reference implementation for the golden cases of @roshd/financial-engine (ST-33.07).

Written from the COMFAR III manual's formulas (as restated in docs/product/comfar-model-spec.md),
not from the TypeScript code: loans are simulated day by day, sum-of-years-digits is shifted month
by month, linear depreciation uses the manual's `M = integral part of ...` form. Arithmetic is exact
(`fractions.Fraction`) wherever the result is rational; fractional powers use `decimal` with 60
significant digits. Every value is written rounded half-even to 12 decimal places.

Run from the repository root:  python packages/financial-engine/golden/reference.py
It rewrites packages/financial-engine/golden/expected.json. Python 3.10+, standard library only.
"""

import json
from decimal import Decimal, ROUND_HALF_EVEN, getcontext
from fractions import Fraction as F
from pathlib import Path

getcontext().prec = 60
SCALE = Decimal('1e-12')


def out(x):
    """Round an exact or decimal value half-even to 12 places and format it."""
    if isinstance(x, F):
        # Exact rounding of a fraction: scale, round half-even on the integer part.
        scaled = x * 10**12
        q, r = divmod(scaled.numerator, scaled.denominator)
        twice = 2 * r
        if twice > scaled.denominator or (twice == scaled.denominator and q % 2 == 1):
            q += 1
        d = Decimal(q).scaleb(-12)
        return format(d.quantize(SCALE), 'f')
    return format(Decimal(x).quantize(SCALE, rounding=ROUND_HALF_EVEN), 'f')


def dec(x):
    return Decimal(x.numerator) / Decimal(x.denominator) if isinstance(x, F) else Decimal(x)


def power(base, exponent):
    """base ** exponent with a rational exponent; exact for integer exponents."""
    exponent = F(exponent)
    if exponent.denominator == 1:
        return F(base) ** exponent.numerator
    return F(dec(F(base)) ** dec(exponent))


# ------------------------------------------------------------------------------------------
# Discounting (XI.D-E)

def factors(months, rates):
    """Cumulative growth factor at the end of each period, from the start of the horizon."""
    acc, result = F(1), []
    for m, r in zip(months, rates):
        acc = acc * power(1 + F(r), F(m, 12))
        result.append(acc)
    return result


def factor_at(months, rates, month):
    acc, elapsed = F(1), 0
    for m, r in zip(months, rates):
        if elapsed >= month:
            break
        used = min(m, month - elapsed)
        acc = acc * power(1 + F(r), F(used, 12))
        elapsed += used
    return acc


def discount(months, rates, reference):
    fs = factors(months, rates)
    if reference == 'START':
        return fs
    at12 = factor_at(months, rates, 12)
    return [f / at12 for f in fs]


def rate_list(rate, n):
    return list(rate) if isinstance(rate, list) else [rate] * n


def npv(months, amounts, rate, reference='END', salvage='0'):
    fs = discount(months, rate_list(rate, len(months)), reference)
    total = sum((F(a) / f for a, f in zip(amounts, fs)), F(0))
    return total + F(salvage) / fs[-1]


def npv_start_decimal(months, amounts, rate, salvage):
    total, acc = Decimal(0), Decimal(1)
    for m, a in zip(months, amounts):
        acc = acc * (1 + rate) ** (Decimal(m) / 12)
        total += Decimal(a) / acc
    return total + Decimal(salvage) / acc


def irr(months, amounts, salvage='0'):
    lo, hi = Decimal('-0.5'), Decimal('3')
    f_lo = npv_start_decimal(months, amounts, lo, salvage)
    for _ in range(300):
        mid = (lo + hi) / 2
        f_mid = npv_start_decimal(months, amounts, mid, salvage)
        if (f_mid < 0) == (f_lo < 0):
            lo, f_lo = mid, f_mid
        else:
            hi = mid
    return (lo + hi) / 2


def mirr(months, amounts, reinvest, borrow, salvage='0', reference_month=12):
    total = sum(months)
    surplus, deficit, elapsed = Decimal(0), Decimal(0), 0
    flows = []
    for m, a in zip(months, amounts):
        elapsed += m
        flows.append((elapsed, F(a)))
    flows.append((total, F(salvage)))
    for at, a in flows:
        if a > 0:
            surplus += dec(a) * (1 + Decimal(reinvest)) ** (Decimal(total - at) / 12)
        elif a < 0:
            deficit += dec(-a) / (1 + Decimal(borrow)) ** (Decimal(at - reference_month) / 12)
    years = Decimal(total - reference_month) / 12
    return (surplus / deficit) ** (1 / years) - 1


# ------------------------------------------------------------------------------------------
# Indicators (X.C.6-7)

def payback(months, amounts):
    cumulative, start, invested = F(0), 0, False
    for i, (m, a) in enumerate(zip(months, amounts)):
        previous = cumulative
        cumulative += a
        if cumulative < 0:
            invested = True
        elif invested and cumulative > 0:
            return {'period': i, 'endMonth': start + m, 'months': start + (-previous / a) * m}
        start += m
    return None


def break_even(sales, variable, fixed, finance, products):
    sales, variable, fixed, finance = F(sales), F(variable), F(fixed), F(finance)
    margin = sales - variable
    ratio = margin / sales
    result = {'value.variableMargin': out(margin), 'value.variableMarginRatio': out(ratio)}
    for name, costs in (('includingFinance', fixed + finance), ('excludingFinance', fixed)):
        value = costs / ratio
        share = value / sales
        result[f'value.{name}.breakEvenSalesValue'] = out(value)
        result[f'value.{name}.breakEvenRatio'] = out(share)
        result[f'value.{name}.fixedCostCoverageRatio'] = out(margin / costs)
        result[f'value.{name}.products[*].salesVolume'] = [out(F(v) * share) for v, _ in products]
        result[f'value.{name}.products[*].salesValue'] = [out(F(r) * share) for _, r in products]
    return result


# ------------------------------------------------------------------------------------------
# Depreciation (XI.H)

def linear_to_scrap(ibv, svr, life_months, m1):
    ibv = F(ibv)
    sv = ibv * F(svr)
    life = F(life_months, 12)
    whole = int(life - F(m1, 12) + 1)  # M = integral part of [L - m1/12 + 1]
    charges = [(ibv - sv) / life * F(m1, 12)] + [(ibv - sv) / life] * (whole - 1)
    rest = ibv - sum(charges) - sv
    if rest > 0:
        charges.append(rest)  # D_{M+1} = RBV_M - SV
    return charges


def declining(ibv, svr, life_months, m1, rate):
    ibv, rate = F(ibv), F(rate)
    sv = ibv * F(svr)
    life = F(life_months, 12)
    charges, book, straight, year = [], ibv, None, 1
    while book > sv:
        if year == 1:
            charge = ibv * rate * F(m1, 12)
        elif straight is not None:
            charge = straight
        else:
            remaining_life = life - F(m1, 12) - (year - 2)  # life left at the start of year j
            if remaining_life <= 0:
                charge = book - sv
            elif book * rate > (book - sv) / remaining_life:
                charge = book * rate
            else:
                straight = (book - sv) / remaining_life
                charge = straight
        charge = min(charge, book - sv)
        charges.append(charge)
        book -= charge
        year += 1
    return charges


def sum_of_years_digits(ibv, life_months, m1):
    base = F(ibv)
    years, extra = divmod(life_months, 12)
    if extra == 0:
        sodl = F(years * (years + 1), 2)
        segments = [(12, base * (years - j + 1) / sodl) for j in range(1, years + 1)]
    else:
        life = F(life_months, 12)
        sodl = (years + 1) * (years + F(2 * extra, 12)) / 2
        stub = life / sodl * F(extra, 12) * base
        adjusted = F(years * (years + 1), 2)
        segments = [(extra, stub)] + [
            (12, (base - stub) * (years - j + 2) / adjusted) for j in range(2, years + 2)
        ]
    # Spread each life year evenly over its months, then sum the months into depreciation years.
    monthly = [amount / length for length, amount in segments for _ in range(length)]
    charges, start, end = [], 0, m1
    while start < life_months:
        charges.append(sum(monthly[start:end], F(0)))
        start, end = end, end + 12
    return charges


# ------------------------------------------------------------------------------------------
# Loans (XI.M), simulated day by day

def loan(case):
    lp = case['repaymentMonths'] * 30
    flows = {}
    for f in case['flows']:
        flows.setdefault(f['day'], []).append(F(f['amount']))
    first_day = min(flows)
    total = sum((a for v in flows.values() for a in v if a > 0), F(0))
    rates = sorted((r['fromDay'], F(r['rate'])) for r in case['rates'])
    share = F(case['capitalisedShare'])
    until = case.get('capitaliseUntilDay', 0)
    fees = {k: F(v) for k, v in case.get('fees', {}).items()}
    due, repay = set(), set()
    first_repayment = None
    if case['type'] == 'PROFILE':
        d = case['interestDueDay']
        while d > first_day:
            d -= lp
        while d <= first_day:
            d += lp
        while d <= case['horizonEndDay']:
            due.add(d)
            d += lp
        last_day = case['horizonEndDay']
    else:
        first_repayment = case.get('firstRepaymentDay')
        if first_repayment is None:
            last = max(d for d, v in flows.items() if any(a > 0 for a in v))
            start = max(last, case['constructionEndDay']) + lp
            first_repayment = -(-start // 30) * 30
        d = first_repayment - lp
        while d > first_day:
            due.add(d)
            d -= lp
        n = case['numberOfRepayments']
        for i in range(n):
            due.add(first_repayment + i * lp)
            repay.add(first_repayment + i * lp)
        last_day = first_repayment + (n - 1) * lp

    def rate_on(day):
        return [r for f, r in rates if f <= day][-1]

    balance, drawn = F(0), F(0)
    interest = guarantee = commitment = F(0)
    events = []
    totals = {'interest': F(0), 'capitalised': F(0), 'fees': F(0)}
    db_n, constant, done, first_disbursement = None, None, 0, True
    for day in range(first_day, last_day + 1):
        if day > first_day:
            interest += balance * rate_on(day) / 360
            guarantee += balance * fees.get('guarantee', F(0)) / 360
            commitment += (total - drawn) * fees.get('commitment', F(0)) / 360
        if day in due:
            if day in repay:
                events.append(('INTEREST_PAID', day, interest))
                totals['interest'] += interest
                if db_n is None:
                    db_n = balance
                remaining = case['numberOfRepayments'] - done
                if remaining == 1:
                    principal = balance
                elif case['type'] == 'CONSTANT_PRINCIPAL':
                    constant = constant if constant is not None else db_n / case['numberOfRepayments']
                    principal = constant
                else:
                    ir = interest / balance
                    growth = (1 + ir) ** remaining
                    principal = balance * ir * growth / (growth - 1) - interest
                balance -= principal
                events.append(('REPAYMENT', day, principal))
                done += 1
            else:
                capitalised = interest * share if day <= until else F(0)
                events.append(('INTEREST_PAID', day, interest - capitalised))
                events.append(('INTEREST_CAPITALISED', day, capitalised))
                totals['interest'] += interest - capitalised
                totals['capitalised'] += capitalised
                balance += capitalised
            totals['fees'] += guarantee + commitment
            interest = guarantee = commitment = F(0)
        for amount in flows.get(day, []):
            if amount > 0:
                balance += amount
                drawn += amount
                fee = amount * fees.get('agency', F(0))
                if first_disbursement:
                    fee += total * fees.get('other', F(0))
                    first_disbursement = False
                totals['fees'] += fee
            else:
                balance += amount
                events.append(('REPAYMENT', day, -amount))
    result = {
        'value.totalDisbursed': out(total),
        'value.totalInterestPaid': out(totals['interest']),
        'value.totalCapitalisedInterest': out(totals['capitalised']),
        'value.totalFees': out(totals['fees']),
        'value.finalBalance': out(balance),
        'value.events[kind=REPAYMENT].amount': [out(a) for k, _, a in events if k == 'REPAYMENT'],
        'value.events[kind=INTEREST_PAID].amount': [
            out(a) for k, _, a in events if k == 'INTEREST_PAID' and a != 0
        ],
    }
    if first_repayment is not None:
        result['value.firstRepaymentDay'] = out(F(first_repayment))
        result['value.debtAtRepaymentStart'] = out(db_n)
    return result


# ------------------------------------------------------------------------------------------
# Cases: same ids and inputs as src/golden/cases.ts

PROJECT_MONTHS = [12] * 8
PROJECT_FLOWS = ['-5200000000000', '-3100000000000', '1450000000000', '2380000000000',
                 '2760000000000', '2890000000000', '2940000000000', '1200000000000']
PROJECT_INVESTMENT = ['5200000000000', '3100000000000', '450000000000', '120000000000',
                      '0', '0', '0', '-600000000000']
SALVAGE = '900000000000'


def build():
    e = {}
    e['npv-textbook'] = {'value': out(npv([12, 12, 12], ['-100', '60', '60'], '0.1', 'START'))}
    e['npv-project'] = {'value': out(npv(PROJECT_MONTHS, PROJECT_FLOWS, '0.18', 'END', SALVAGE))}
    e['npv-rate-path'] = {'value': out(npv(
        [6, 6, 12, 12, 12], ['-800000000', '-400000000', '450000000', '520000000', '610000000'],
        ['0.25', '0.25', '0.22', '0.2', '0.2'], 'START'))}
    e['irr-project'] = {'value': out(irr(PROJECT_MONTHS, PROJECT_FLOWS, SALVAGE))}
    e['irr-uneven'] = {'value': out(irr([3, 3, 3, 3, 12, 12], ['-40', '-40', '-20', '10', '60', '70']))}
    e['mirr-project'] = {'value': out(mirr(PROJECT_MONTHS, PROJECT_FLOWS, '0.2', '0.15', SALVAGE))}

    pb = payback(PROJECT_MONTHS, [F(a) for a in PROJECT_FLOWS])
    e['payback-project'] = {'value.period': out(F(pb['period'])), 'value.endMonth': out(F(pb['endMonth'])),
                            'value.months': out(pb['months'])}
    fs = factors(PROJECT_MONTHS, ['0.12'] * 8)
    dpb = payback(PROJECT_MONTHS, [F(a) / f for a, f in zip(PROJECT_FLOWS, fs)])
    e['dynamic-payback-project'] = {'value.period': out(F(dpb['period'])),
                                    'value.endMonth': out(F(dpb['endMonth'])),
                                    'value.months': out(dpb['months'])}

    fs_end = discount(PROJECT_MONTHS, ['0.18'] * 8, 'END')
    project_npv = sum((F(a) / f for a, f in zip(PROJECT_FLOWS, fs_end)), F(0))
    pvi = sum((F(a) / f for a, f in zip(PROJECT_INVESTMENT, fs_end)), F(0))
    e['npvr-project'] = {'value.npv': out(project_npv), 'value.presentValueOfInvestment': out(pvi),
                         'value.ratio': out(project_npv / pvi),
                         'value.profitabilityIndex': out(1 + project_npv / pvi)}

    fs_bcr = factors([12] * 4, ['0.12'] * 4)
    benefits = sum((F(a) / f for a, f in zip(['0', '4100000000', '5200000000', '5600000000'], fs_bcr)), F(0))
    costs = sum((F(a) / f for a, f in zip(['7300000000', '2100000000', '2300000000', '2450000000'], fs_bcr)), F(0))
    e['bcr'] = {'value.ratio': out(benefits / costs), 'value.presentValueOfBenefits': out(benefits),
                'value.presentValueOfCosts': out(costs)}

    e['break-even'] = break_even('6420000000000', '3870000000000', '1130000000000', '310000000000',
                                 [('18500', '4810000000000'), ('46000', '1610000000000')])

    sales, volume, variable, fixed = F('4810000000000'), F(18500), F('2950000000000'), F('870000000000')
    price, ratio = sales / volume, (sales - variable) / sales
    be_value = fixed / ratio
    e['product-break-even'] = {
        'value.averageUnitPrice': out(price), 'value.variableMarginRatio': out(ratio),
        'value.fixedCostCoverageRatio': out((sales - variable) / fixed),
        'value.constantPrice.breakEvenSalesValue': out(be_value),
        'value.constantPrice.breakEvenSalesVolume': out(be_value / price),
        'value.constantPrice.breakEvenRatio': out(be_value / price / volume),
        'value.constantVolume.breakEvenSalesPrice': out((fixed + variable) / volume),
        'value.constantVolume.breakEvenRatio': out((fixed + variable) / volume / price),
    }

    rows = [('0', '0', '0', '0'), ('410000000000', '700000000000', '520000000000', '12000000000'),
            ('690000000000', '700000000000', '390000000000', '9000000000'),
            ('-35000000000', '700000000000', '260000000000', '6000000000')]
    ratios = []
    for surplus, *service in rows:
        ds = sum((F(x) for x in service), F(0))
        if ds > 0:
            ratios.append(out((F(surplus) + ds) / ds))
    e['dscr'] = {'value.periods[ratio].ratio': ratios, 'value.minimum.period': out(F(3)),
                 'value.minimum.ratio': ratios[-1]}

    cash = [F(x) for x in ['1642000000000', '1789000000000', '931000000000', '2200000000000']]
    debt = [F(x) for x in ['2800000000000', '2100000000000', '1400000000000', '0']]
    fl = factors([12] * 4, ['0.18', '0.18', '0.2', '0.2'])
    llcr = []
    for t in range(3):
        base = F(1) if t == 0 else fl[t - 1]
        llcr.append(out(sum((cash[k] * base / fl[k] for k in range(t, 3)), F(0)) / debt[t]))
    e['llcr'] = {'value[0]': llcr[0], 'value[1]': llcr[1], 'value[2]': llcr[2]}

    amounts = [F('3600000000000'), F('2800000000000'), F('1900000000000')]
    after_tax = [F('0.32'), F('0.18') * F('0.75'), F('0.23') * F('0.75')]
    e['wacc'] = {'value': out(sum((a * k for a, k in zip(amounts, after_tax)), F(0)) / sum(amounts, F(0)))}

    e['depreciation-linear-scrap'] = {
        'value.years[*].depreciation': [out(c) for c in linear_to_scrap('2750000000000', '0.1', 66, 6)]}
    e['depreciation-declining'] = {
        'value.years[*].depreciation': [out(c) for c in declining('1830000000000', '0.05', 72, 9, '0.3')]}
    e['depreciation-syd'] = {
        'value.years[*].depreciation': [out(c) for c in sum_of_years_digits('960000000000', 51, 5)]}

    inflation = [F(x) for x in ['0.35', '0.32', '0.3', '0.28', '0.25']]
    esc, factor, escalation = F('0.03'), F(1), []
    for j, r in enumerate(inflation):
        factor *= (1 + r + ((1 + esc) ** 2 - 1)) if j == 0 else (1 + r + esc)
        escalation.append(out(factor))
    e['escalation'] = {'value[*]': escalation}

    foreign = [F(x) for x in ['0.03', '0.025', '0.025', '0.02', '0.02']]
    pr, path = F(1), []
    for local, other in zip(inflation, foreign):
        path.append(out(pr * 615000))
        pr = pr * (1 + local) / (1 + other)
    e['exchange-rates'] = {'value[*]': path}

    e['loan-annuity'] = loan({
        'type': 'ANNUITY', 'repaymentMonths': 3,
        'flows': [{'day': 75, 'amount': '1200000000000'}, {'day': 250, 'amount': '900000000000'},
                  {'day': 410, 'amount': '700000000000'}],
        'rates': [{'fromDay': 1, 'rate': '0.18'}, {'fromDay': 541, 'rate': '0.2'}],
        'capitalisedShare': '1', 'capitaliseUntilDay': 630, 'numberOfRepayments': 12,
        'constructionEndDay': 720, 'fees': {'agency': '0.002', 'commitment': '0.005', 'other': '0.01'}})
    e['loan-constant-principal'] = loan({
        'type': 'CONSTANT_PRINCIPAL', 'repaymentMonths': 6,
        'flows': [{'day': 45, 'amount': '850000000000'}, {'day': 300, 'amount': '650000000000'}],
        'rates': [{'fromDay': 1, 'rate': '0.23'}], 'capitalisedShare': '0.5', 'capitaliseUntilDay': 540,
        'numberOfRepayments': 8, 'firstRepaymentDay': 900, 'fees': {'guarantee': '0.01'}})
    e['loan-profile'] = loan({
        'type': 'PROFILE', 'repaymentMonths': 12,
        'flows': [{'day': 20, 'amount': '500000000000'}, {'day': 200, 'amount': '300000000000'},
                  {'day': 610, 'amount': '-250000000000'}, {'day': 905, 'amount': '-300000000000'},
                  {'day': 1290, 'amount': '-250000000000'}],
        'rates': [{'fromDay': 1, 'rate': '0.2'}, {'fromDay': 721, 'rate': '0.24'}],
        'capitalisedShare': '0', 'interestDueDay': 180, 'horizonEndDay': 1440})
    return e


if __name__ == '__main__':
    target = Path(__file__).with_name('expected.json')
    target.write_text(json.dumps(build(), indent=2) + '\n', encoding='utf-8')
    print(f'wrote {target}')
