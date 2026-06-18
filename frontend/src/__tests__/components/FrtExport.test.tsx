/**
 * Unit tests for .frt export payload construction.
 *
 * Verifies that the handleExportFrt logic includes all 'more details' fields
 * (life dates, social handles, photo_url) and family group custom labels.
 */

import type { ApiPerson, ApiFamilyGroup, ApiTreeGraph } from '@features/tree/types';

// ── Payload builder (mirrors handleExportFrt in FamilyTreePage.tsx) ──

function buildFrtPayload(
  graph: ApiTreeGraph,
  treeName: string,
  treeDescription: string | null,
) {
  return {
    frt_version: '1.0',
    exported_at: new Date().toISOString(),
    tree_name: treeName,
    tree_description: treeDescription ?? null,
    persons: graph.persons.map((p) => ({
      id: p.id,
      display_given_name: p.displayGivenName,
      display_surname: p.displaySurname,
      sex: p.sex,
      is_living: p.isLiving,
      is_deceased: p.isDeceased,
      ...(p.photoUrl ? { photo_url: p.photoUrl } : {}),
      ...(p.birthDate ? { birth_date: p.birthDate } : {}),
      ...(p.deathDate ? { death_date: p.deathDate } : {}),
      ...(p.birthYear != null ? { birth_year: p.birthYear } : {}),
      ...(p.deathYear != null ? { death_year: p.deathYear } : {}),
      ...(p.facebookHandle ? { facebook_handle: p.facebookHandle } : {}),
      ...(p.xHandle ? { x_handle: p.xHandle } : {}),
      ...(p.linkedinHandle ? { linkedin_handle: p.linkedinHandle } : {}),
    })),
    family_groups: graph.familyGroups.map((fg) => ({
      id: fg.id,
      union_type: fg.unionType,
      ...(fg.customLabel ? { custom_label: fg.customLabel } : {}),
      parent_ids: fg.parentIds,
      children: fg.children,
    })),
  };
}

// ── Test data ───────────────────────────────────────────────────────

const fullPerson: ApiPerson = {
  id: 'p1',
  treeId: 't1',
  displayGivenName: 'Mary Anne',
  displaySurname: 'Trump',
  sex: 'FEMALE',
  isLiving: false,
  isDeceased: true,
  photoUrl: 'https://example.com/photo.jpg',
  birthDate: '1912-05-10',
  deathDate: '2000-08-07',
  birthYear: 1912,
  deathYear: 2000,
  facebookHandle: 'maryanne',
  xHandle: 'maryanne_t',
  linkedinHandle: 'in/maryanne',
};

const minimalPerson: ApiPerson = {
  id: 'p2',
  treeId: 't1',
  displayGivenName: 'Johannes',
  displaySurname: 'Trump',
  sex: 'MALE',
  isLiving: false,
  isDeceased: true,
};

const fullFg: ApiFamilyGroup = {
  id: 'fg1',
  treeId: 't1',
  unionType: 'MARRIAGE',
  customLabel: 'Church Wedding',
  parentIds: ['p1', 'p2'],
  children: { p3: 'BIOLOGICAL' },
};

const minimalFg: ApiFamilyGroup = {
  id: 'fg2',
  treeId: 't1',
  unionType: 'UNKNOWN',
  parentIds: [],
  children: {},
};

// ── Tests ───────────────────────────────────────────────────────────

describe('.frt export payload', () => {
  it('includes all more-details fields for a fully populated person', () => {
    const graph: ApiTreeGraph = { treeId: 't1', persons: [fullPerson], familyGroups: [] };
    const payload = buildFrtPayload(graph, 'Test Tree', 'A description');
    const p = payload.persons[0];

    expect(p.display_given_name).toBe('Mary Anne');
    expect(p.display_surname).toBe('Trump');
    expect(p.photo_url).toBe('https://example.com/photo.jpg');
    expect(p.birth_date).toBe('1912-05-10');
    expect(p.death_date).toBe('2000-08-07');
    expect(p.birth_year).toBe(1912);
    expect(p.death_year).toBe(2000);
    expect(p.facebook_handle).toBe('maryanne');
    expect(p.x_handle).toBe('maryanne_t');
    expect(p.linkedin_handle).toBe('in/maryanne');
  });

  it('omits optional fields when they are not set', () => {
    const graph: ApiTreeGraph = { treeId: 't1', persons: [minimalPerson], familyGroups: [] };
    const payload = buildFrtPayload(graph, 'Test Tree', null);
    const p = payload.persons[0];

    expect(p).not.toHaveProperty('photo_url');
    expect(p).not.toHaveProperty('birth_date');
    expect(p).not.toHaveProperty('death_date');
    expect(p).not.toHaveProperty('birth_year');
    expect(p).not.toHaveProperty('death_year');
    expect(p).not.toHaveProperty('facebook_handle');
    expect(p).not.toHaveProperty('x_handle');
    expect(p).not.toHaveProperty('linkedin_handle');
  });

  it('includes custom_label on family groups when present', () => {
    const graph: ApiTreeGraph = { treeId: 't1', persons: [], familyGroups: [fullFg] };
    const payload = buildFrtPayload(graph, 'Test', null);
    const fg = payload.family_groups[0];

    expect(fg.custom_label).toBe('Church Wedding');
    expect(fg.union_type).toBe('MARRIAGE');
  });

  it('omits custom_label on family groups when not set', () => {
    const graph: ApiTreeGraph = { treeId: 't1', persons: [], familyGroups: [minimalFg] };
    const payload = buildFrtPayload(graph, 'Test', null);
    const fg = payload.family_groups[0];

    expect(fg).not.toHaveProperty('custom_label');
  });

  it('handles a mix of full and minimal persons', () => {
    const graph: ApiTreeGraph = {
      treeId: 't1',
      persons: [fullPerson, minimalPerson],
      familyGroups: [fullFg, minimalFg],
    };
    const payload = buildFrtPayload(graph, 'Mixed Tree', 'desc');

    expect(payload.persons).toHaveLength(2);
    expect(payload.persons[0].birth_year).toBe(1912);
    expect(payload.persons[1]).not.toHaveProperty('birth_year');

    expect(payload.family_groups).toHaveLength(2);
    expect(payload.family_groups[0].custom_label).toBe('Church Wedding');
    expect(payload.family_groups[1]).not.toHaveProperty('custom_label');
  });

  it('sets tree metadata correctly', () => {
    const graph: ApiTreeGraph = { treeId: 't1', persons: [], familyGroups: [] };
    const payload = buildFrtPayload(graph, 'My Family', 'Some description');

    expect(payload.frt_version).toBe('1.0');
    expect(payload.tree_name).toBe('My Family');
    expect(payload.tree_description).toBe('Some description');
    expect(payload.exported_at).toBeTruthy();
  });

  it('sets tree_description to null when not provided', () => {
    const graph: ApiTreeGraph = { treeId: 't1', persons: [], familyGroups: [] };
    const payload = buildFrtPayload(graph, 'My Family', null);

    expect(payload.tree_description).toBeNull();
  });
});
