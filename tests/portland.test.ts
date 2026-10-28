import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject } from '../src/domain/fixtures';
import { checkPortland, fixturePortlandFacts, PORTLAND_RULES, PORTLAND_SOURCES, portlandTotalCoverageLimit } from '../src/domain/portland';
import type { PortlandFacts } from '../src/domain/portland';
import type { Project } from '../src/domain/types';

const find = (project: Project, id: string, facts: PortlandFacts = fixturePortlandFacts(project)) => {
  const result = checkPortland(project, facts).find(check => check.id === id);
  assert.ok(result); return result;
};

test('canonical fictional declarations yield isolated location/coverage results and unresolved living area, height and applicability', () => {
  const project = makeProject();
  const checks = checkPortland(project, fixturePortlandFacts(project));
  assert.equal(checks.length, 7);
  for (const id of ['portland-adu-location', 'portland-accessory-coverage', 'portland-individual-coverage', 'portland-total-coverage']) assert.equal(find(project, id).outcome, 'pass');
  for (const id of ['portland-living-area', 'portland-height', 'portland-applicability']) assert.equal(find(project, id).outcome, 'review');
  assert.equal(find(project, 'portland-total-coverage').limit, 2250);
  assert.equal(find(project, 'portland-accessory-coverage').limit, 1000);
});

test('unknown or unsupported scope never returns a definitive source-based result', () => {
  const project = makeProject();
  assert.ok(checkPortland(project).every(check => check.outcome === 'review'));
  for (const patch of [{ zone: 'R7' }, { flatSite: false }, { interiorLot: false }, { oneNewDetachedAduWithHouse: false }]) {
    assert.ok(checkPortland(project, { ...fixturePortlandFacts(project), ...patch }).every(check => check.outcome === 'review'));
  }
  assert.ok(checkPortland(makeProject('birch'), fixturePortlandFacts(makeProject('birch'))).every(check => check.outcome === 'review'));
});

test('Table 110-5 piecewise maxima and calculated fractional maxima are handled at every band', () => {
  for (const [area, expected] of [[2999,1499],[3000,1500],[4999,2249],[5000,2250],[19999,4499],[20000,4500],[20040,4503],[6600,2490],[3800,1800]]) assert.equal(portlandTotalCoverageLimit(area), expected);
  for (const area of [0,-1,NaN,Infinity]) assert.throws(() => portlandTotalCoverageLimit(area));
});

test('ADU location implements the OR branch using a declared street and entrance orientation', () => {
  const base = makeProject();
  const facts = fixturePortlandFacts(base);
  assert.equal(find({ ...base, design: { ...base.design, z: 40 } }, 'portland-adu-location', facts).outcome, 'pass');
  const shallowHouse = { ...base, site: { ...base.site, house: { ...base.site.house, z: 10, depth: 20 } }, design: { ...base.design, z: 30 } };
  assert.equal(find(shallowHouse, 'portland-adu-location', facts).outcome, 'pass');
  assert.equal(find({ ...base, design: { ...base.design, z: 39.9 } }, 'portland-adu-location', facts).outcome, 'fail');
  assert.equal(find(base, 'portland-adu-location', { ...facts, streetAtZ0AndPrimaryEntranceFacesStreet: false }).outcome, 'review');
});

test('coverage requires complete declared inventory and uses the greater-of900 individual cap', () => {
  const project = makeProject();
  const facts = fixturePortlandFacts(project);
  assert.equal(find(project, 'portland-accessory-coverage', { ...facts, otherAccessoryCoverageSqFt: 425 }).outcome, 'fail');
  for (const invalid of [undefined,-1,NaN,'0']) {
    const uncertain = { ...facts, otherAccessoryCoverageSqFt: invalid } as PortlandFacts;
    assert.equal(find(project, 'portland-accessory-coverage', uncertain).outcome, 'review');
  }
  assert.equal(find(project, 'portland-total-coverage', { ...facts, footprintMatchesCodeCoverage: false }).outcome, 'review');
  const smallPrimary = { ...project, site: { ...project.site, house: { x: 10, z: 15, width: 20, depth: 20 } }, design: { ...project.design, width: 30, depth: 30 } };
  assert.equal(find(smallPrimary, 'portland-individual-coverage', facts).limit, 900);
  assert.equal(find(smallPrimary, 'portland-individual-coverage', facts).outcome, 'pass');
});

test('living-area check never treats either footprint or primaryFloorArea as code living area', () => {
  const project = makeProject();
  assert.equal(find(project, 'portland-living-area').measured, null);
  const facts = { ...fixturePortlandFacts(project), primaryLivingAreaSqFt: 1000, aduLivingAreaSqFt: 751, measurementRevision: project.revision };
  assert.equal(find(project, 'portland-living-area', facts).limit, 750);
  assert.equal(find(project, 'portland-living-area', facts).outcome, 'fail');
  assert.equal(find(project, 'portland-living-area', { ...facts, aduLivingAreaSqFt: 750 }).outcome, 'pass');
  assert.equal(find(project, 'portland-living-area', { ...facts, primaryLivingAreaSqFt: 1001 }).limit, 750);
  assert.equal(find(project, 'portland-living-area', { ...facts, primaryLivingAreaSqFt: 2000, aduLivingAreaSqFt: 800 }).limit, 800);
});

test('code height needs its own current-revision measurement and does not use peak height', () => {
  const project = makeProject();
  const facts = { ...fixturePortlandFacts(project), codeMeasuredHeightFt: 20, measurementRevision: project.revision };
  assert.equal(find(project, 'portland-height', facts).outcome, 'pass');
  assert.equal(find(project, 'portland-height', { ...facts, codeMeasuredHeightFt: 20.01 }).outcome, 'fail');
  assert.equal(find(project, 'portland-height', { ...facts, codeMeasuredHeightFt: undefined }).outcome, 'review');
  const intrusion = { ...project, design: { ...project.design, x: 1 } };
  assert.equal(find(intrusion, 'portland-height', facts).outcome, 'review');
});

test('stale, missing or malformed unit declarations return review and cannot certify applicability', () => {
  const project = makeProject();
  const facts = { ...fixturePortlandFacts(project), primaryLivingAreaSqFt: 1400, aduLivingAreaSqFt: 500, codeMeasuredHeightFt: 16, measurementRevision: project.revision };
  for (const revision of [undefined, project.revision - 1, project.revision + 1]) {
    assert.equal(find(project, 'portland-living-area', { ...facts, measurementRevision: revision }).outcome, 'review');
    assert.equal(find(project, 'portland-height', { ...facts, measurementRevision: revision }).outcome, 'review');
  }
  assert.equal(find(project, 'portland-living-area', { ...facts, aduLivingAreaSqFt: '500 sq ft' } as unknown as PortlandFacts).outcome, 'review');
  assert.equal(find(project, 'portland-height', { ...facts, codeMeasuredHeightFt: NaN }).outcome, 'review');
  assert.equal(find(project, 'portland-applicability', facts).outcome, 'review');
});

test('fixture declarations cannot be obtained just by copying a fixture ID onto changed geometry', () => {
  const project = makeProject();
  assert.deepEqual(fixturePortlandFacts({ ...project, site: { ...project.site, width: 400 } }), {});
});

test('source-derived rule metadata retains exact source sections and access date without claiming effective dates', () => {
  assert.ok(PORTLAND_RULES.every(rule => rule.kind === 'verified' && rule.source.startsWith('https://www.portland.gov/')));
  assert.ok(PORTLAND_RULES.every(rule => /preliminary|review|calculated/i.test(rule.note)));
  assert.ok(PORTLAND_SOURCES.every(source => source.accessedAt === '2026-10-27' && source.effectiveDate === null));
});
