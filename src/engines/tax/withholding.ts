// Canadian Part XIII / Reg. 105 withholding on payments from a Canadian payer to a non-resident.
import type { EntityNode, FeeTerms, RevenueShareTerms, SourceRef, Tri } from '../../types/domain';
import { ruleValue } from './rules';

export type PaymentKind =
  | 'interest'
  | 'dividend'
  | 'deemed-dividend'
  | 'management-fee'
  | 'royalty'
  | 'revenue-share'
  | 'service-fee'
  | 'principal'
  | 'capital'
  | 'grant'
  | 'rights-fee'
  | 'athlete-payment'
  | 'other';

export interface WithholdingContext {
  year: number;
  participating?: boolean;
  /** Payer and recipient deal at arm's length (question of fact). */
  armsLength: Tri;
  /** Recipient's voting % of the payer (dividend 5% test). */
  votingPctOfPayer?: number;
  fee?: FeeTerms;
  revenueShare?: RevenueShareTerms;
  treatyClaimed: boolean;
}

export interface WithholdingResult {
  applies: boolean;
  domesticRate: number;
  treatyRate: number | null;
  appliedRate: number | null; // null = unsupported / cannot be computed
  amount: number | null;
  /** final = permanent Part XIII tax; refundable = payment on account (Reg. 105) */
  permanence: 'none' | 'final' | 'refundable' | 'unsupported';
  confidence: 'high' | 'medium' | 'low';
  basis: string;
  conditions: string[];
  sources: SourceRef[];
  /** Potential exposure (for unsupported characterisations). */
  exposure?: number;
}

const S = (id: string, label: string): SourceRef => ({ id, label });
const none = (basis: string, sources: SourceRef[] = []): WithholdingResult => ({ applies: false, domesticRate: 0, treatyRate: null, appliedRate: 0, amount: 0, permanence: 'none', confidence: 'high', basis, conditions: [], sources });

/** Share of the payment for which the U.S. treaty can be claimed, and how, given the recipient's U.S. classification. */
export function treatyAccess(recipient: EntityNode): { share: number; corporateShare: number; note: string; conditional: boolean } {
  const t = recipient.tax;
  if (recipient.tax.residence !== 'US') return { share: 0, corporateShare: 0, note: 'Recipient is not a U.S. resident; the Canada–U.S. treaty does not apply.', conditional: false };
  const lobConditional = t.lobQualifying !== 'yes';
  if (recipient.kind !== 'us-llc' && recipient.kind !== 'investor') {
    return { share: 1, corporateShare: recipient.kind === 'individual' ? 0 : 1, note: 'U.S. resident recipient.', conditional: lobConditional };
  }
  switch (t.usClassification) {
    case 'corporation':
      return { share: 1, corporateShare: 1, note: 'LLC classified as a corporation is itself a U.S. resident company (Art. IV(1)), subject to limitation on benefits (Art. XXIX A).', conditional: lobConditional };
    case 'partnership':
    case 'disregarded': {
      const us = t.memberUsResidentShare ?? 1;
      return {
        share: us,
        corporateShare: t.memberCorporateShare ?? 0,
        note: `Fiscally transparent LLC: treaty benefits flow to U.S.-resident members (Art. IV(6)) — ${(us * 100).toFixed(0)}% of the payment.`,
        conditional: true,
      };
    }
    default:
      return { share: t.memberUsResidentShare ?? 1, corporateShare: t.memberCorporateShare ?? 0, note: 'The LLC’s U.S. tax classification is not confirmed; treaty access is conditional.', conditional: true };
  }
}

export function canadianWithholding(kind: PaymentKind, gross: number, payer: EntityNode, recipient: EntityNode, ctx: WithholdingContext): WithholdingResult {
  if (payer.tax.residence !== 'CA' || recipient.tax.residence === 'CA' || recipient.kind === 'government') return none('Payment is not from a Canadian resident to a non-resident.');
  if (kind === 'principal' || kind === 'capital') return none('Repayment of principal or contribution of capital is not income and is not subject to Part XIII.', [S('ita-212-1', 'ITA s. 212(1)')]);
  const part13 = ruleValue('ca-part13-general', ctx.year).value;
  const access = treatyAccess(recipient);
  const tc = ctx.treatyClaimed;
  const blended = (treatyRate: number) => (tc ? access.share * treatyRate + (1 - access.share) * part13 : part13);
  const cond = (extra: string[] = []) => [access.note, ...(access.conditional ? ['Treaty benefits require confirmation of residence, beneficial ownership and limitation-on-benefits status (Art. XXIX A); forms such as NR301/NR302 are needed.'] : []), ...extra];

  if (kind === 'interest') {
    const nal = ctx.armsLength !== 'yes';
    if (!nal && !ctx.participating) {
      return { ...none('Arm’s-length, non-participating interest is not subject to Part XIII (s. 212(1)(b)).', [S('ita-212-1', 'ITA s. 212(1)(b)')]), conditions: ['Arm’s-length status is a question of fact.'] };
    }
    const treaty = ctx.participating ? ruleValue('tr-div-15', ctx.year).value : ruleValue('tr-int-0', ctx.year).value;
    const rate = blended(treaty);
    return {
      applies: true,
      domesticRate: part13,
      treatyRate: treaty,
      appliedRate: rate,
      amount: gross * rate,
      permanence: rate > 0 ? 'final' : 'none',
      confidence: access.conditional || ctx.armsLength === 'unknown' ? 'medium' : 'high',
      basis: ctx.participating
        ? 'Participating interest: 25% domestically; treaty caps Canadian tax at 15% (Art. XI(6)(b)).'
        : 'Non-arm’s-length interest: 25% domestically (s. 212(1)(b)); the treaty gives exclusive taxing rights to the U.S. (Art. XI(1)) for a U.S. beneficial owner.',
      conditions: cond(ctx.armsLength === 'unknown' ? ['Whether the lender deals at arm’s length with the borrower has not been confirmed.'] : []),
      sources: [S('ita-212-1', 'ITA s. 212(1)(b)'), S('tr-xi-5p', 'Convention Art. XI (Fifth Protocol)')],
    };
  }

  if (kind === 'dividend' || kind === 'deemed-dividend') {
    const vote = ctx.votingPctOfPayer ?? 0;
    const corpPart = access.corporateShare;
    const fivePctOk = (share: number) => vote * share >= 0.1;
    const r5 = ruleValue('tr-div-5', ctx.year).value;
    const r15 = ruleValue('tr-div-15', ctx.year).value;
    let treaty: number;
    if (recipient.kind === 'us-llc' && recipient.tax.usClassification === 'corporation') treaty = vote >= 0.1 ? r5 : r15;
    else treaty = corpPart > 0 && fivePctOk(corpPart) ? corpPart * r5 + (1 - corpPart) * r15 : r15;
    const rate = blended(treaty);
    return {
      applies: true,
      domesticRate: part13,
      treatyRate: treaty,
      appliedRate: rate,
      amount: gross * rate,
      permanence: 'final',
      confidence: access.conditional ? 'medium' : 'high',
      basis:
        kind === 'deemed-dividend'
          ? 'Interest disallowed under the thin-capitalization rules is deemed a dividend (s. 214(16)) and withheld at the dividend rate.'
          : 'Dividends: 25% domestically (s. 212(2)); treaty rate 5% for a company owning ≥10% of the voting stock (look-through for fiscally transparent owners), otherwise 15% (Art. X(2)).',
      conditions: cond(),
      sources: [S('ita-212-2', 'ITA s. 212(2)'), S('tr-x-2a-5p', 'Convention Art. X(2)(a) (Fifth Protocol)'), S('tr-x', 'Convention Art. X(2)(b)'), ...(kind === 'deemed-dividend' ? [S('ita-214-16', 'ITA s. 214(16)')] : [])],
    };
  }

  if (kind === 'management-fee' || kind === 'service-fee') {
    const f = ctx.fee;
    const inCanada = f?.servicesInCanadaPct ?? 0;
    const carveOut = ctx.armsLength === 'yes';
    const domestic = kind === 'management-fee' && !carveOut ? part13 : 0;
    // Treaty: business profits taxable in Canada only through a PE (Art. VII) — fee withholding reduced to 0 with treaty claim.
    const treaty = 0;
    const part13Rate = kind === 'management-fee' ? (tc ? access.share * treaty + (1 - access.share) * domestic : domestic) : 0;
    const reg105 = ruleValue('ca-reg105', ctx.year).value * inCanada;
    const total = part13Rate + reg105;
    return {
      applies: total > 0,
      domesticRate: domestic,
      treatyRate: treaty,
      appliedRate: total,
      amount: gross * total,
      permanence: part13Rate > 0 ? 'final' : reg105 > 0 ? 'refundable' : 'none',
      confidence: 'medium',
      basis: [
        kind === 'management-fee'
          ? carveOut
            ? 'Arm’s-length, ordinary-course service fees fall outside "management or administration fee" (s. 212(4)).'
            : 'Non-arm’s-length management fees: 25% (s. 212(1)(a)). For a U.S. resident without a Canadian permanent establishment, the fee is business profit taxable only in the U.S. (Art. VII), so withholding can be reduced with a treaty claim.'
          : 'Service fees are not Part XIII income.',
        reg105 > 0 ? `Services performed in Canada (${(inCanada * 100).toFixed(0)}%): 15% Reg. 105 withholding on that portion is a payment on account, recoverable by filing or reducible by waiver.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      conditions: cond(inCanada > 0 ? ['Services in Canada can create a permanent establishment, including a services PE after 183 days (Art. V(9)).'] : []),
      sources: [S('ita-212-1', 'ITA s. 212(1)(a)'), S('ita-212-4', 'ITA s. 212(4)'), S('itr-105', 'ITR s. 105'), S('tr-vii', 'Convention Art. VII'), S('tr-v-9', 'Convention Art. V(9)')],
    };
  }

  if (kind === 'royalty') {
    const ip = ctx.fee?.ipType ?? 'other';
    const exempt = ip === 'software' || ip === 'know-how' || ip === 'copyright';
    const treaty = exempt ? 0 : ruleValue('tr-roy-10', ctx.year).value;
    const rate = blended(treaty);
    return {
      applies: true,
      domesticRate: part13,
      treatyRate: treaty,
      appliedRate: rate,
      amount: gross * rate,
      permanence: rate > 0 ? 'final' : 'none',
      confidence: ip === 'event-rights' || ip === 'other' ? 'medium' : 'high',
      basis: exempt
        ? 'Royalties for software, know-how or cultural copyright are exempt from Canadian tax for a U.S. beneficial owner (Art. XII(3)).'
        : `Royalties: 25% domestically (s. 212(1)(d)); treaty cap 10% (Art. XII(2)) — trademark and similar licences are not exempt. IP type: ${ip}.`,
      conditions: cond(['The characterisation of the payment as a royalty depends on the licence terms.']),
      sources: [S('ita-212-1', 'ITA s. 212(1)(d)'), S('tr-xii', 'Convention Art. XII'), S('tr-xii-3-1995', 'Art. XII(3) (1995 Protocol)')],
    };
  }

  if (kind === 'revenue-share') {
    const ch = ctx.revenueShare?.characterization ?? 'participating-payment';
    if (ch === 'partnership-pe') {
      return {
        ...none('If the arrangement is a partnership carrying on business in Canada, the U.S. partner is taxed by Canada on its share as business profits of a permanent establishment (Part I and branch tax), rather than by withholding.', [S('tr-vii', 'Convention Art. VII'), S('tr-x', 'Convention Art. X(6) branch tax')]),
        confidence: 'low',
        conditions: ['Whether a contractual joint venture is a partnership is a question of provincial law and fact.'],
      };
    }
    if (ch === 'contractual-no-pe') {
      return {
        applies: true,
        domesticRate: part13,
        treatyRate: 0,
        appliedRate: tc ? access.share * 0 + (1 - access.share) * part13 : part13,
        amount: gross * (tc ? (1 - access.share) * part13 : part13),
        permanence: 'final',
        confidence: 'low',
        basis: 'A profit or revenue share paid under a contract may be argued to be U.S. business profits (Art. VII, no Canadian PE). Canada may instead treat payments that depend on production or use of property as subject to s. 212(1)(d). Characterisation is unresolved.',
        conditions: cond(['Characterisation requires a legal opinion.']),
        sources: [S('ita-212-1', 'ITA s. 212(1)(d)'), S('tr-vii', 'Convention Art. VII')],
      };
    }
    return {
      applies: true,
      domesticRate: part13,
      treatyRate: null,
      appliedRate: part13,
      amount: gross * part13,
      permanence: 'final',
      confidence: 'low',
      basis: 'Conservative case: payment computed by reference to revenue/profits treated as subject to 25% Part XIII with no treaty reduction assumed.',
      conditions: ['Characterisation requires a legal opinion.'],
      sources: [S('ita-212-1', 'ITA s. 212(1)(d)')],
    };
  }

  if (kind === 'rights-fee') {
    return {
      applies: true,
      domesticRate: part13,
      treatyRate: null,
      appliedRate: null,
      amount: null,
      permanence: 'unsupported',
      confidence: 'low',
      basis: 'Hosting or rights fees paid to FIBA (a non-resident) may be royalties or similar payments under s. 212(1)(d), or fees for services. The applicable treaty is not in the library. The engine does not compute this withholding; the potential exposure at the 25% statutory rate is shown separately.',
      conditions: ['Requires the executed hosting agreement and a review of FIBA’s residence and treaty position.'],
      sources: [S('ita-212-1', 'ITA s. 212(1)(d)')],
      exposure: gross * part13,
    };
  }

  if (kind === 'athlete-payment') {
    const reg = ruleValue('ca-reg105', ctx.year).value;
    return {
      applies: true,
      domesticRate: reg,
      treatyRate: null,
      appliedRate: reg,
      amount: gross * reg,
      permanence: 'refundable',
      confidence: 'medium',
      basis: 'Fees paid by the host to non-resident athletes for performances in Canada attract 15% Reg. 105 withholding. Under the U.S. treaty an athlete may be exempt if gross receipts in Canada do not exceed $15,000 for the year (Art. XVI(1)). FIBA pays prize money directly (Book 6), so this applies only to amounts the host pays.',
      conditions: ['Per-athlete thresholds and residence must be verified.'],
      sources: [S('itr-105', 'ITR s. 105'), S('tr-xvi', 'Convention Art. XVI')],
    };
  }

  if (kind === 'grant') return none('Grants and donations are not Part XIII income, but grant terms may restrict use.');
  return { ...none('No withholding category modelled for this payment.'), confidence: 'low' };
}
