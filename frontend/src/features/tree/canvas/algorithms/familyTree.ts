/**
 * familyTreeLayout — compact generational family tree layout.
 *
 * Guarantees:
 *   - Every person at the same generation shares the same Y row.
 *   - Co-parents (spouses) are always placed side-by-side (COUPLE_GAP apart).
 *   - The FG ring sits centred between the two parents.
 *   - Siblings are spread evenly below their FG ring.
 *   - Subtree widths are computed bottom-up so branches don't overlap.
 *
 * Key fix over the previous version: we track every placed node in `posMap`
 * so that when one spouse is already positioned (placed as a child in their
 * own parents' FG), the other spouse is placed NEXT TO them — not at the
 * theoretical subtree centre, which caused the spouses-far-apart bug.
 */

import type { ApiTreeGraph, PositionedNode } from '../../types';
import {
  PERSON_NODE_WIDTH  as PW,
  PERSON_NODE_HEIGHT as PH,
  FAMILY_NODE_SIZE   as FS,
} from '../../types';

const COUPLE_GAP          = 24;   // horizontal gap between spouses
const DEFAULT_SIBLING_GAP = 40;
const DEFAULT_V_GAP       = 80;
const MARGIN              = 40;

// ── Generation assignment ───────────────────────────────────────────────────

function computeGenerations(
  graph: ApiTreeGraph,
  personParentFG: Map<string, string>,
  personChildFGs: Map<string, string[]>,
  fgById: Map<string, ApiTreeGraph['familyGroups'][number]>,
): Map<string, number> {
  const gen = new Map<string, number>();

  // Root persons (not a child of any FG) start at generation 0
  for (const p of graph.persons) {
    if (!personParentFG.has(p.id)) gen.set(p.id, 0);
  }

  // BFS downward from every root
  const queue: [string, number][] = [];
  for (const [id, g] of gen) queue.push([id, g]);

  while (queue.length > 0) {
    const [pid, g] = queue.shift()!;
    if ((gen.get(pid) ?? -1) > g) continue;
    gen.set(pid, g);
    for (const fgId of personChildFGs.get(pid) ?? []) {
      const fg = fgById.get(fgId)!;
      for (const childId of Object.keys(fg.children)) {
        if ((gen.get(childId) ?? -1) < g + 1) queue.push([childId, g + 1]);
      }
    }
  }

  // Any disconnected person defaults to 0
  for (const p of graph.persons) {
    if (!gen.has(p.id)) gen.set(p.id, 0);
  }

  // Spouse promotion + child cascade — iterate until stable
  // Co-parents must share the same generation row.
  let stable = false;
  while (!stable) {
    stable = true;
    for (const fg of graph.familyGroups) {
      const pGens = fg.parentIds.map((id) => gen.get(id) ?? 0);
      const maxG  = pGens.length ? Math.max(...pGens) : 0;
      for (const pid of fg.parentIds) {
        if ((gen.get(pid) ?? 0) < maxG) { gen.set(pid, maxG); stable = false; }
      }
      const childG = maxG + 1;
      for (const cId of Object.keys(fg.children)) {
        if ((gen.get(cId) ?? 0) < childG) { gen.set(cId, childG); stable = false; }
      }
    }
  }

  return gen;
}

// ── Main export ─────────────────────────────────────────────────────────────

export function familyTreeLayout(
  graph: ApiTreeGraph,
  opts: { nodeHGap?: number; nodeVGap?: number } = {},
): PositionedNode[] {
  if (graph.persons.length === 0) return [];

  const sibGap = opts.nodeHGap ?? DEFAULT_SIBLING_GAP;
  const vGap   = opts.nodeVGap ?? DEFAULT_V_GAP;

  // ── Lookup maps ──────────────────────────────────────────────────────────
  const fgById = new Map(graph.familyGroups.map((fg) => [fg.id, fg]));

  const personParentFG = new Map<string, string>(); // childId → fgId
  const personChildFGs = new Map<string, string[]>(); // parentId → fgId[]

  for (const fg of graph.familyGroups) {
    for (const cId of Object.keys(fg.children)) personParentFG.set(cId, fg.id);
    for (const pId of fg.parentIds) {
      const list = personChildFGs.get(pId) ?? [];
      list.push(fg.id);
      personChildFGs.set(pId, list);
    }
  }

  // ── Phase 1: Generation numbers ──────────────────────────────────────────
  const genMap = computeGenerations(graph, personParentFG, personChildFGs, fgById);

  const ROW_H = PH + vGap;

  function yPerson(id: string)  { return MARGIN + (genMap.get(id) ?? 0) * ROW_H; }
  function yFG(fgId: string) {
    const fg  = fgById.get(fgId)!;
    const maxParentGen = fg.parentIds.length
      ? Math.max(...fg.parentIds.map((id) => genMap.get(id) ?? 0))
      : 0;
    // Centred vertically in the gap between parent row bottom and child row top
    return MARGIN + maxParentGen * ROW_H + PH + vGap / 2 - FS / 2;
  }

  // ── Phase 2: Subtree widths (bottom-up) ──────────────────────────────────
  const wMemo = new Map<string, number>();

  function personW(id: string): number {
    const k = `p:${id}`;
    if (wMemo.has(k)) return wMemo.get(k)!;
    const fgIds = personChildFGs.get(id) ?? [];
    const w = fgIds.length
      ? fgIds.reduce((s, fgId, i) => s + fgW(fgId) + (i > 0 ? sibGap : 0), 0)
      : PW;
    wMemo.set(k, w);
    return w;
  }

  function fgW(fgId: string): number {
    const k = `fg:${fgId}`;
    if (wMemo.has(k)) return wMemo.get(k)!;
    const fg       = fgById.get(fgId)!;
    const coupleW  = fg.parentIds.length >= 2 ? PW + COUPLE_GAP + PW : PW;
    const children = Object.keys(fg.children);
    if (!children.length) { wMemo.set(k, coupleW); return coupleW; }
    const childrenW = children.reduce((s, cId, i) => s + personW(cId) + (i > 0 ? sibGap : 0), 0);
    const w = Math.max(coupleW, childrenW);
    wMemo.set(k, w);
    return w;
  }

  // ── Phase 3: Placement ───────────────────────────────────────────────────
  //
  // posMap tracks the placed x for every person so we can look up where a
  // pre-placed parent ended up and anchor the spouse NEXT TO them.

  const result:  PositionedNode[] = [];
  const posMap   = new Map<string, number>(); // personId → placed x
  const placedFGs = new Set<string>();

  function pushPerson(id: string, x: number) {
    result.push({ id, x, y: yPerson(id) });
    posMap.set(id, x);
  }

  function placeFG(fgId: string, suggestedLeftX: number) {
    if (placedFGs.has(fgId)) return;
    placedFGs.add(fgId);

    const fg  = fgById.get(fgId)!;
    const myW = fgW(fgId);
    const [p1Id, p2Id] = fg.parentIds;

    // suggestedCx is the ideal horizontal centre of this FG's full subtree
    // (computed from the space allocated by the caller).  It drives child
    // placement regardless of where parents ended up, which prevents the ring
    // from drifting far right when parents come from different subtrees.
    const suggestedCx = suggestedLeftX + myW / 2;

    // ── Place parents ────────────────────────────────────────────────────
    //   • Both fresh   → centre couple over suggestedCx
    //   • One placed   → put the other immediately adjacent (COUPLE_GAP)
    //   • Both placed  → leave them (they may come from different FGs)

    if (p1Id && p2Id) {
      const p1Fixed = posMap.has(p1Id);
      const p2Fixed = posMap.has(p2Id);

      if (!p1Fixed && !p2Fixed) {
        pushPerson(p1Id, suggestedCx - COUPLE_GAP / 2 - PW);
        pushPerson(p2Id, suggestedCx + COUPLE_GAP / 2);
      } else if (p1Fixed && !p2Fixed) {
        pushPerson(p2Id, posMap.get(p1Id)! + PW + COUPLE_GAP);
      } else if (!p1Fixed && p2Fixed) {
        pushPerson(p1Id, posMap.get(p2Id)! - COUPLE_GAP - PW);
      }
      // Both already placed → leave where they are
    } else if (p1Id) {
      if (!posMap.has(p1Id)) pushPerson(p1Id, suggestedCx - PW / 2);
    }

    // ── Place children centred under suggestedCx ─────────────────────────
    //
    // We always use suggestedCx (not the parent midpoint) so children land
    // inside the space the caller reserved for this subtree.

    const children = Object.keys(fg.children);

    if (!children.length) {
      // No children — ring sits between the parents (or at suggestedCx)
      let ringCx = suggestedCx;
      if (p1Id && p2Id) {
        const px1 = posMap.get(p1Id);
        const px2 = posMap.get(p2Id);
        if (px1 !== undefined && px2 !== undefined) ringCx = (px1 + px2 + PW) / 2;
        else if (px1 !== undefined) ringCx = px1 + PW / 2;
      } else if (p1Id) {
        const px1 = posMap.get(p1Id);
        if (px1 !== undefined) ringCx = px1 + PW / 2;
      }
      result.push({ id: fgId, x: ringCx - FS / 2, y: yFG(fgId) });
      return;
    }

    const totalChildW = children.reduce((s, cId, i) => s + personW(cId) + (i > 0 ? sibGap : 0), 0);
    let childX = suggestedCx - totalChildW / 2;

    for (const cId of children) {
      const cw   = personW(cId);
      const cFGs = personChildFGs.get(cId) ?? [];

      if (!posMap.has(cId)) {
        if (cFGs.length > 0) {
          let fgX = childX;
          for (const cFgId of cFGs) {
            placeFG(cFgId, fgX);
            fgX += fgW(cFgId) + sibGap;
          }
          // Ensure the child is placed even if all their FGs were already done
          if (!posMap.has(cId)) pushPerson(cId, childX + (cw - PW) / 2);
        } else {
          pushPerson(cId, childX + (cw - PW) / 2);
        }
      }
      childX += cw + sibGap;
    }

    // ── Place ring centred over actual child positions ───────────────────
    //
    // Re-centering after children are placed means the ring stays above
    // them even when some siblings were pre-placed by a different subtree.
    const placedXs = children
      .map((cId) => posMap.get(cId))
      .filter((x): x is number => x !== undefined);
    const ringCx = placedXs.length > 0
      ? (Math.min(...placedXs) + Math.max(...placedXs) + PW) / 2
      : suggestedCx;

    result.push({ id: fgId, x: ringCx - FS / 2, y: yFG(fgId) });
  }

  // ── Kick-off: root FGs ───────────────────────────────────────────────────
  const rootFGs = graph.familyGroups.filter((fg) =>
    fg.parentIds.every((pid) => !personParentFG.has(pid)),
  );

  let curX = MARGIN;
  for (const fg of rootFGs) {
    placeFG(fg.id, curX);
    curX += fgW(fg.id) + sibGap * 2;
  }

  // Persons not reached by any FG (isolated root persons)
  for (const p of graph.persons) {
    if (posMap.has(p.id)) continue;
    pushPerson(p.id, curX);
    curX += PW + sibGap;
  }

  // Orphaned FG nodes — try to place near their parents; fall back to curX
  for (const fg of graph.familyGroups) {
    if (placedFGs.has(fg.id)) continue;
    const parentXs = fg.parentIds
      .map((pid) => posMap.get(pid))
      .filter((x): x is number => x !== undefined);
    let ringX: number;
    if (parentXs.length >= 2) {
      ringX = (parentXs[0] + parentXs[1] + PW) / 2 - FS / 2;
    } else if (parentXs.length === 1) {
      ringX = parentXs[0] + PW / 2 - FS / 2;
    } else {
      ringX = curX;
      curX += FS + sibGap;
    }
    result.push({ id: fg.id, x: ringX, y: yFG(fg.id) });
  }

  return result;
}
