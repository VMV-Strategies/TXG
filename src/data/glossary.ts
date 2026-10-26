// Plain-English glossary. Terms are tappable throughout the interface.
export interface GlossaryTerm {
  term: string;
  aliases?: string[];
  plain: string;
  expert?: string;
  sources?: string[];
}

export const GLOSSARY: GlossaryTerm[] = [
  { term: 'CCPC', aliases: ['Canadian-controlled private corporation'], plain: 'A Canadian-controlled private corporation is a particular type of private Canadian company that may qualify for certain Canadian tax benefits. Whether a company qualifies depends on who owns and controls it and on several legal rules.', expert: 'ITA s. 125(7): a private Canadian corporation not controlled (de jure or de facto) by non-residents or public corporations, not so controlled if all non-resident/public shares were held by one person, and with no listed class.', sources: ['ita-125-7-ccpc', 'ita-251-5', 'ita-256-5.1'] },
  { term: 'Small business deduction', aliases: ['SBD'], plain: 'A lower tax rate on the first part of a CCPC’s active business income (up to $500,000 a year, shared with associated companies). It is not automatic — the company must be a CCPC all year and the limit can shrink.', expert: 'ITA s. 125(1)-(5.1); federal net rate 9%; Ontario lower rate 2.2% from July 1, 2026.', sources: ['ita-125-1', 'ita-125-2'] },
  { term: 'Business limit', plain: 'The amount of income — normally $500,000 a year — that can get the small-business rate. Associated companies share one limit, and it shrinks for large companies or companies with significant investment income.', sources: ['ita-125-2'] },
  { term: 'Associated corporations', plain: 'Companies treated as one group for some tax rules — for example when the same person controls both. They must share one small-business limit.', sources: ['ita-256-1'] },
  { term: 'De facto control', plain: 'Control in fact — influence that lets someone run a company even without a majority of the votes, for example through board-appointment rights, vetoes or economic dependence.', sources: ['ita-256-5.1'] },
  { term: 'EBITDA', plain: 'Earnings before interest, taxes, depreciation and amortization — a measure of operating profit before financing and tax.' },
  { term: 'IRR', aliases: ['Internal rate of return'], plain: 'The yearly percentage return that makes the money you put in equal to the money you get back, taking timing into account. It is undefined when money only goes one way.' },
  { term: 'MOIC', aliases: ['Multiple on invested capital'], plain: 'Total money received back divided by total money invested. 2.0× means you got back twice what you put in, ignoring timing.' },
  { term: 'Part XIII tax', aliases: ['withholding tax', 'Withholding'], plain: 'A tax Canada collects on certain payments to non-residents — dividends, some interest, royalties, some fees. The Canadian payer holds back part of the payment and sends it to the government. A tax treaty can reduce the rate.', sources: ['ita-212-1', 'ita-215-1'] },
  { term: 'Regulation 105', aliases: ['Reg. 105'], plain: 'A 15% amount Canada requires to be held back from fees for services a non-resident performs in Canada. It is a prepayment, not necessarily the final tax — it can be recovered by filing or reduced by a waiver.', sources: ['itr-105'] },
  { term: 'Thin capitalization', aliases: ['thin cap'], plain: 'Canada limits interest deductions on loans from significant foreign shareholders when the company has much more such debt than equity (more than 1.5 to 1). Excess interest is not deductible and is taxed like a dividend.', sources: ['ita-18-4', 'ita-214-16'] },
  { term: 'EIFEL', aliases: ['Excessive interest and financing expenses limitation'], plain: 'A Canadian rule that can cap net interest deductions at 30% of a measure of taxable earnings. Smaller CCPC groups and groups with little interest are excluded.', sources: ['ita-18.2-excluded', 'ita-18.2-2'] },
  { term: 'Transfer pricing', plain: 'The prices related companies charge each other (interest, fees, royalties) must match what unrelated parties would agree. Tax authorities on both sides can adjust prices that don’t.', sources: ['ita-247-2', 'irc-482', 'tr-ix'] },
  { term: 'Permanent establishment', aliases: ['PE'], plain: 'A fixed place of business (or certain agents or long service projects) through which a foreign company does business in a country. With a PE, the country can tax the business profits; without one, a treaty usually prevents it.', sources: ['tr-v', 'tr-v-9', 'tr-vii'] },
  { term: 'Limitation on benefits', aliases: ['LOB'], plain: 'Treaty rules that only give reduced rates to genuine residents meeting ownership and other tests, to stop treaty shopping.', sources: ['tr-xxixa-5p'] },
  { term: 'Fiscally transparent', plain: 'An entity that is ignored for tax so its owners are taxed directly — such as a disregarded LLC or a tax partnership. Special treaty rules decide who gets treaty benefits.', sources: ['tr-iv-6-7'] },
  { term: 'Disregarded entity', plain: 'A single-member LLC that, by default, is ignored for U.S. federal income tax; its owner reports the income.', sources: ['cfr-301.7701-3'] },
  { term: 'Check-the-box', aliases: ['Form 8832'], plain: 'The U.S. election that lets an eligible entity such as an LLC choose to be taxed as a corporation instead of its default treatment.', sources: ['cfr-301.7701-3'] },
  { term: 'Foreign tax credit', aliases: ['FTC'], plain: 'A U.S. credit for income tax paid to another country, so the same income is not fully taxed twice. It is limited to the U.S. tax on that foreign income.', sources: ['irc-901', 'irc-904'] },
  { term: '§ 245A deduction', aliases: ['dividends received deduction', 'DRD'], plain: 'A U.S. corporation that owns 10% or more of a foreign company can deduct the foreign-source part of dividends from it — but cannot also claim a credit for foreign tax on those dividends.', sources: ['irc-245a'] },
  { term: 'CFC', aliases: ['Controlled foreign corporation'], plain: 'A foreign company more than 50% owned by U.S. shareholders. Its U.S. owners may be taxed currently on some of its income and must file information returns.', sources: ['irc-957', 'irc-951', 'irc-951a'] },
  { term: 'Not-for-profit corporation', aliases: ['NFP'], plain: 'A corporation without share capital that may not pay profits to its members. It is not automatically a charity and cannot issue tax receipts unless registered.', sources: ['nfp-34'] },
  { term: 'Registered charity', plain: 'An organization registered with the CRA that can issue official donation receipts. Registration requires exclusively charitable purposes and activities.', sources: ['ita-149.1-charorg', 'ita-248-qd'] },
  { term: 'Qualified donee', plain: 'An organization (such as a registered charity or RCAAA) that can issue official donation receipts and receive gifts from charities.', sources: ['ita-248-qd'] },
  { term: 'RCAAA', aliases: ['Registered Canadian amateur athletic association'], plain: 'A national amateur sport organization registered with the CRA that can issue donation receipts. Its exclusive purpose must be promoting amateur athletics in Canada nationwide.', sources: ['ita-149.1-caaa', 'ita-149.1-6.01'] },
  { term: 'Soliciting corporation', plain: 'A not-for-profit that receives more than a set amount of public money (donations from non-members or government grants) in a period. It must have at least three directors and meet extra disclosure rules.', sources: ['nfp-2-5.1', 'nfp-125'] },
  { term: 'HST', aliases: ['GST/HST'], plain: 'Ontario’s 13% sales tax on most goods and services. Businesses collect it from customers and usually recover HST they pay on costs (input tax credits). It is not the business’s revenue.', sources: ['eta-165'] },
  { term: 'Input tax credit', aliases: ['ITC'], plain: 'The way a registered business recovers the GST/HST it paid on its costs.' },
  { term: 'Paid-up capital', aliases: ['PUC'], plain: 'The tax value of share capital — generally what shareholders paid for their shares. It can be returned without dividend tax and counts as equity for thin cap.' },
  { term: 'Retained earnings', plain: 'Accumulated profits (less losses and dividends) kept in the company.' },
  { term: 'Preferred shares', plain: 'Shares that get paid dividends and/or capital back before common shares, often at a fixed rate, and may have limited votes.' },
  { term: 'Convertible loan', plain: 'A loan that can turn into shares. For Canadian control tests, the right to convert counts as if already exercised.', sources: ['ita-251-5'] },
  { term: 'Cap table', plain: 'A list of who owns which shares, how many votes they carry and what percentage each holder owns.' },
  { term: 'Distribution waterfall', plain: 'The order in which exit proceeds are paid out — for example, preferred capital and return first, then everyone else.' },
  { term: 'Sources and uses', plain: 'A check that every dollar coming in (investment, revenue) is matched by where it went (costs, repayments, taxes, cash left over).' },
  { term: 'Elimination', plain: 'Removing payments between companies in the same group when measuring the group as a whole, so internal transfers are not counted as profit.' },
  { term: 'Arm’s length', plain: 'Dealing as unrelated parties would. Related companies are generally not at arm’s length, and some tax rules apply only then.' },
  { term: 'Fair market value', aliases: ['FMV'], plain: 'The price unrelated, informed parties would agree on.' },
  { term: 'Break-even', plain: 'The point where revenue equals costs. “Operating break-even” ignores financing costs; “all-in break-even” includes interest and fees.' },
  { term: 'Runway', plain: 'How long the cash on hand lasts at the current rate of spending.' },
  { term: 'Pro Circuit', plain: 'FIBA’s professional 3x3 events — the men’s World Tour and Challengers, and the Women’s Series — run under FIBA rules and handbooks.', sources: ['fiba-b6-ch4'] },
  { term: 'World Tour', aliases: ['WT'], plain: 'FIBA’s top men’s professional 3x3 series: WT Masters events (12-team main draws) and a final.', sources: ['fiba-b6-ch4'] },
  { term: 'Women’s Series', aliases: ['WS'], plain: 'FIBA’s professional women’s 3x3 series; tournaments are in principle 12 teams under the Women’s Series Handbook.', sources: ['fiba-b6-ch4'] },
  { term: 'Challenger', plain: 'A men’s Pro Circuit event, in principle 16 teams, that can qualify teams to World Tour Masters.', sources: ['fiba-b6-ch4'] },
  { term: 'Endorsed event', plain: 'A 3x3 event that accepts FIBA’s endorsement terms on FIBA’s digital platform and joins the FIBA 3x3 competition network.', sources: ['fiba-b6-ch5'] },
  { term: 'Hosting agreement', plain: 'The contract with FIBA that grants the right to host an event and sets fees, obligations and which commercial rights the host keeps. Nothing in this app treats hosting terms as confirmed until it is executed.' },
  { term: 'Form 5471', plain: 'A U.S. information return for U.S. persons with interests in certain foreign corporations.', sources: ['irc-6038', 'irc-6046'] },
  { term: 'NR301', plain: 'The CRA form a non-resident gives a Canadian payer to claim a reduced treaty withholding rate.' },
];

export function findTerm(t: string): GlossaryTerm | undefined {
  const q = t.toLowerCase();
  return GLOSSARY.find((g) => g.term.toLowerCase() === q || g.aliases?.some((a) => a.toLowerCase() === q));
}
