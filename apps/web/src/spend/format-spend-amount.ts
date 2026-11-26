export interface SpendDisplay {
  readonly currency: string;

  // the rate of one US dollar in the currency
  readonly rate: number;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// A count or a limit in US dollars, with its approximate amount in the display currency beside it,
// such as "$12.40 (about A$19)". With no display the figure stands alone.
export function formatSpendAmount(dollars: number, display: SpendDisplay | null): string {
  const figure = usd.format(dollars);

  if (display === null) {
    return figure;
  }

  const converted = dollars * display.rate;

  const local = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: display.currency,
    maximumFractionDigits: converted >= 10 ? 0 : 2,
    minimumFractionDigits: converted >= 10 ? 0 : 2,
  });

  return `${figure} (about ${local.format(converted)})`;
}
