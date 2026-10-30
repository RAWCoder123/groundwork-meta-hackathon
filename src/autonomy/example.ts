import { applyDecision, createAutoProject, finishStage, putArtifact, validateProject } from './domain';
import { makeOfficeConcept } from './concept';
import type { AutoProject } from './types';

export const EXAMPLE_TITLE = 'Example · Fictional Portland office fit-out';
const brief = 'Fictional Portland office fit-out in a 60 by 40 foot rectangular suite with a 10 foot ceiling. Keep the existing office use, exterior and structure unchanged. Explore an open workspace, a meeting room, two quiet offices and shared circulation. Help me develop the concept and permit strategy, identify missing professional information and prepare a reviewed handoff. Existing permit history, technical compliance and site conditions are not verified.';

/** A prepared, clearly labeled sample at the design checkpoint so a visitor can explore the
 * workspace without spending model requests. It is built only with the application's own
 * domain operations; it contains no Meta output, critique, research retrieval or city record. */
export function buildExampleProject(ownerId: string): AutoProject {
  const at = new Date().toISOString();
  let p = createAutoProject(ownerId, brief);
  p.title = EXAMPLE_TITLE; p.entryPoint = 'brief';
  p.events[0].detail = 'Prepared example created from a fictional brief. No agent work was queued.';
  p.messages.push({ id: `message_example_${p.id}`, role: 'system', text: 'Prepared example. These drafts were written for demonstration and no Meta request was made. Start your own project to see the agent work.', createdAt: at });
  p = putArtifact(p, 'understanding', {
    summary: 'Interior alteration of an existing fictional Portland office suite, keeping office use, exterior and structure unchanged.',
    confirmedFacts: ['The brief declares a 60 by 40 foot rectangular suite with a 10 foot ceiling.', 'The brief asks for an open workspace, a meeting room, two quiet offices and shared circulation.'],
    assumptions: ['Suite dimensions are declared inputs, not field measurements.', 'The existing office use is assumed to continue; legal occupancy has not been confirmed.'],
    missingInformation: ['Approved permit history for the suite.', 'Existing-conditions drawings or a field survey.', 'Fire, accessibility and mechanical review by the responsible professionals.'],
  });
  p = finishStage(p);
  p = applyDecision(p, p.decisions.find(d => d.status === 'pending')!.id, 'approve');
  p = putArtifact(p, 'concept', makeOfficeConcept(60, 40) as unknown as Record<string, unknown>);
  p = putArtifact(p, 'strategy', {
    summary: 'Treat the work as a commercial interior alteration and prepare an applicant-side package for professional review before any city submission.',
    route: 'Commercial interior alteration permit for an existing office suite, to be confirmed by the responsible professional.',
    requirements: ['Plans prepared to the city’s detailed commercial plan expectations.', 'Code analysis for the altered area by a qualified professional.'],
    nextSteps: ['Confirm permit history and existing conditions.', 'Engage the responsible design professional to prepare permit drawings.'],
    unresolved: ['Applicable code edition and any required discipline reviews have not been determined.'],
  }, [
    { url: 'https://www.portland.gov/ppd/commercial-permitting/commercial-requirements', title: 'Commercial permit application requirements', accessedAt: at, claim: 'Commercial permit applications have published submittal requirements.', retrievalKind: 'search_citation' },
    { url: 'https://www.portland.gov/ppd/commercial-permitting/changing-commercial-space/prepare/create-detailed-plans', title: 'Detailed commercial plans', accessedAt: at, claim: 'The city describes plan expectations for changing commercial space.', retrievalKind: 'search_citation' },
  ]);
  p = finishStage(p);
  return validateProject(p);
}
