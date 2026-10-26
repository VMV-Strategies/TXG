// Scenario schema migration: fills fields added in later releases so that
// scenarios saved by earlier versions (or imported from backups) keep working.
import type { Scenario } from '../types/domain';
import { defaultTasks } from '../data/synthetic/defaultScenario';

export const SCENARIO_SCHEMA = 2;

export function migrateScenario(input: unknown): Scenario {
  const s = structuredClone(input) as Scenario & { schema?: number };
  if (!s || typeof s !== 'object' || !Array.isArray(s.entities)) throw new Error('Invalid scenario');
  s.years ??= [2027, 2028, 2029];
  s.fx ??= { cadPerUsd: { 2027: 1.35 }, mode: 'forecast' };
  s.relationships ??= [];
  s.events ??= [];
  s.sponsors ??= [];
  s.venues ??= [];
  s.tasks ??= defaultTasks();
  s.fiba ??= [];
  s.monthlyYear ??= s.years[0];
  s.assumptions ??= { sponsorshipBasis: 'expected', usUnknownAs: 'pass-through', defaultPayout: 0.3 };
  s.assumptions.defaultPayout ??= 0.3;
  s.taxSettings ??= { sbdTreatment: 'auto', disallowUndocumentedFees: false, ccaYears: 3, usStateModel: 'NY', treatyClaimed: true };
  s.investor ??= { investmentUsd: 0, investYear: s.years[0], instrument: 'common', ownershipPct: 0, prefRate: 0.08, loanRate: 0.1, exitYear: s.years[s.years.length - 1], exitMethod: 'ebitda-multiple', exitMultiple: 8, distributionPolicy: 0.5, investorTaxRate: 0 };
  s.investor.investorTaxRate ??= 0;
  s.foundation ??= { purposes: [], governingDocsLoaded: false };
  s.baseline ??= 'custom';
  s.roles ??= { operator: 'op', usVenture: 'txg', foundation: 'fdn', investor: 'pe' };
  for (const e of s.entities) {
    e.tax ??= { residence: e.jurisdiction === 'US' ? 'US' : 'CA' };
    e.currency ??= e.jurisdiction === 'US' ? 'USD' : 'CAD';
    e.evidence ??= 'assumption';
    e.inGroup ??= false;
  }
  s.schema = SCENARIO_SCHEMA;
  return s;
}
