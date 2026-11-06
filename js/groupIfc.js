// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* groupIfc.js — THE CONTAINMENT BLOCK'S .IFC TWIN (ROAD-3583). Save Model writes the native block
   (GroupHierarchyModel.toBlock) AND this IFC4X3_ADD2 file through APKSoftapp.saveModel; Open Model reads
   it back to the same block. Written with the contracts STEP codec (vendor/apk-contracts/apk-ifc.js,
   scripts/vendor-ifc.mjs), no IfcOpenShell in the page. Byte-deterministic: the same block writes the
   same file, every GlobalId uuid5 of a role under the block id.

   A group is IFC's own word for it where IFC's spatial structure allows that word, else an IfcGroup:
     Campus     IfcSite             at the root or inside another Campus
     Building   IfcBuilding         at the root, or inside a Campus or a Building; it gets one
                                    IfcBuildingStorey (its rooms are parts of a storey, as IFC wants)
     Room       IfcSpace            inside a Building (through its storey) or inside another Room
     Rack, Bay  IfcElementAssembly  USERDEFINED, ObjectType 'EquipmentRack' (the BIM racks' word) | 'Bay'
     the rest   IfcGroup            Zone, Sub-System, Boundary, any other word (ObjectType = the word), and
                                    a Campus / Building / Room where IFC's spatial order does not allow it
   (the nearest spatial ancestor decides; a group in between is looked through; inside a rack, nothing
   is spatial). Nesting is IFC's relationships:
     spatial in spatial        IfcRelAggregates (a building's rooms through its storey; roots by the project)
     rack in a spatial         IfcRelContainedInSpatialStructure (a building's: its storey)
     rack in a rack            IfcRelAggregates
     anything in an IfcGroup   IfcRelAssignsToGroup (as well as the spatial / rack link above, if any)
     IfcGroup in a product     IfcRelAssignsToProduct
   APK_Group (every group): GroupId, ParentId, Classification (the editor's word), Colour, LineStyle,
   Padding (the editor's diagram, never a length). APK_GroupContainment on the project: BlockId, NextId.
   Both are declared in DATABASE.server.BIM SRC/tools/ifc/apk_psets_editors.py. The reader takes the
   tree from APK_Group.ParentId, else from the relationships (a group from another tool). */

import { entitiesByType, enumv, getPsets, ifcGuid, isRef, parseStep, real, ref, typed, writeStep } from '../vendor/apk-contracts/apk-ifc.js';

export const GROUP_IFC_SCHEMA = 'IFC4X3_ADD2';
const STAMP = '1970-01-01T00:00:00';   // fixed: the file is a function of the block, never of the clock

const str = (v) => (v == null ? '' : String(v));
const label = (s) => typed('IFCLABEL', String(s));
const ident = (s) => typed('IFCIDENTIFIER', String(s));
const int = (n) => typed('IFCINTEGER', Math.trunc(n));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** The IFC word a classification is when IFC's spatial order allows it: site | building | space | rack | group. */
export function kindOf(type) {
  const t = String(type || '').trim().toLowerCase();
  if (t === 'campus' || t === 'site') return 'site';
  if (t === 'building') return 'building';
  if (t === 'room' || t === 'space') return 'space';
  if (t === 'rack' || t === 'bay') return 'rack';
  return 'group';
}
const RANK = { site: 0, building: 1, space: 2 };
const ALLOWED_UNDER = { site: ['', 'site'], building: ['', 'site', 'building'], space: ['building', 'space'] };
const ENTITY = { site: 'IFCSITE', building: 'IFCBUILDING', space: 'IFCSPACE', rack: 'IFCELEMENTASSEMBLY', group: 'IFCGROUP' };

/**
 * Each group's IFC role: {g, kind, parent, spatialParent, productParent}. parent is the direct parent (or
 * null), spatialParent the nearest spatial ancestor, productParent the nearest site / building / space /
 * rack ancestor. A cycle or a missing parent makes the group a root.
 */
export function resolveGroups(groups) {
  const list = Array.isArray(groups) ? groups : [];
  const byId = new Map(list.map((g) => [g.id, g]));
  const parentOf = (g) => {
    const p = g.parentId == null ? null : byId.get(g.parentId);
    return p && p !== g ? p : null;
  };
  // roots first, so every ancestor is resolved before its children; a cycle is broken at its first member
  const order = [];
  const seen = new Set();
  const visit = (g, path = new Set()) => {
    if (seen.has(g.id)) return;
    path.add(g.id);
    const p = parentOf(g);
    if (p && !path.has(p.id)) visit(p, path);
    seen.add(g.id);
    order.push(g);
  };
  list.forEach((g) => visit(g));
  const out = new Map();
  for (const g of order) {
    let p = parentOf(g);
    if (p && !out.has(p.id)) p = null;           // a cycle: this group is a root
    const pr = p ? out.get(p.id) : null;
    let kind = kindOf(g.type);
    const spatialAbove = pr ? (pr.kind in RANK ? pr : pr.spatialParent) : null;
    const rackAbove = pr ? (pr.kind === 'rack' ? pr : pr.rackAbove) : null;
    if (kind in RANK && (rackAbove || !ALLOWED_UNDER[kind].includes(spatialAbove ? spatialAbove.kind : ''))) kind = 'group';
    const productParent = pr ? (pr.kind === 'group' ? pr.productParent : pr) : null;
    out.set(g.id, { g, kind, parent: pr, spatialParent: spatialAbove, rackAbove, productParent });
  }
  return list.map((g) => out.get(g.id));
}

class Writer {
  constructor() { this.entities = []; }
  add(type, ...args) {
    const id = this.entities.length + 1;
    this.entities.push({ id, type, args });
    return ref(id);
  }
}

const stemOf = (name) => String(name || 'group').replace(/\.(ifc|json)$/i, '');

/** The containment block (toBlock) as IFC4X3_ADD2 STEP text. `name` is the file stem. */
export function groupsToIfc(block, { name } = {}) {
  const b = block || {};
  const stem = stemOf(name || b.name);
  const blockId = str(b.id) || stem;
  const W = new Writer();
  const P = ifcGuid('groups', blockId);
  const gid = (...roles) => ifcGuid('decl', P, ...roles);
  const rel = (...roles) => ifcGuid('rel', ...roles);

  const person = W.add('IFCPERSON', null, 'APK.audio', null, null, null, null, null, null);
  const org = W.add('IFCORGANIZATION', null, 'APK.audio', 'Group editor', null, null);
  const po = W.add('IFCPERSONANDORGANIZATION', person, org, null);
  const app = W.add('IFCAPPLICATION', org, '1', 'APK.audio group editor', 'EDITORS.GroupBuddy');
  const oh = W.add('IFCOWNERHISTORY', po, app, null, null, null, null, null, 0);
  const mm = W.add('IFCSIUNIT', { kind: 'derived' }, enumv('LENGTHUNIT'), enumv('MILLI'), enumv('METRE'));
  const units = W.add('IFCUNITASSIGNMENT', [mm]);
  const origin = W.add('IFCAXIS2PLACEMENT3D', W.add('IFCCARTESIANPOINT', [real(0), real(0), real(0)]), null, null);
  const ctx = W.add('IFCGEOMETRICREPRESENTATIONCONTEXT', null, 'Model', 3, real(1e-5), origin, null);
  const project = W.add('IFCPROJECT', P, oh, str(b.name) || stem, 'Group editor: nested spatial boundaries', null, null, null, [ctx], units);

  const defs = [];
  const prop = (n, v) => (v == null || v === '' ? null : W.add('IFCPROPERTYSINGLEVALUE', n, null, v, null));
  const pset = (setName, ownerGid, owner, props) => {
    const list = props.filter(Boolean);
    if (!list.length) return;
    const ps = W.add('IFCPROPERTYSET', ifcGuid('rel', 'pset', ownerGid, setName), oh, setName, null, list);
    defs.push([ifcGuid('rel', 'props', ownerGid, setName), owner, ps]);
  };
  const nextId = num(b.nextId);
  pset('APK_GroupContainment', P, project, [prop('BlockId', ident(blockId)), nextId != null ? prop('NextId', int(nextId)) : null]);

  // ---- every group, in block order (its parent is always written first: resolveGroups orders them)
  const roles = resolveGroups(b.groups);
  const made = new Map();      // group id -> { ref, gid, kind, placement, storey? }
  const pending = [...roles];
  const byParent = (r) => (r.parent ? made.get(r.parent.g.id) : null);
  while (pending.length) {
    const i = pending.findIndex((r) => !r.parent || made.has(r.parent.g.id));
    const r = pending.splice(i < 0 ? 0 : i, 1)[0];
    const g = r.g;
    const id = gid('group', String(g.id));
    const nm = str(g.name) || `${g.type || 'Group'} ${g.id}`;
    const word = str(g.type) || 'Group';
    const above = r.productParent ? made.get(r.productParent.g.id) : null;
    const pl = r.kind === 'group' ? null : W.add('IFCLOCALPLACEMENT', above ? above.placement : null, origin);
    let e;
    if (r.kind === 'site') e = W.add('IFCSITE', id, oh, nm, null, word, pl, null, null, enumv('ELEMENT'), null, null, null, null, null);
    else if (r.kind === 'building') e = W.add('IFCBUILDING', id, oh, nm, null, word, pl, null, null, enumv('ELEMENT'), null, null, null);
    else if (r.kind === 'space') e = W.add('IFCSPACE', id, oh, nm, null, word, pl, null, null, enumv('ELEMENT'), enumv('NOTDEFINED'), null);
    else if (r.kind === 'rack') {
      const rackWord = /^rack$/i.test(word) ? 'EquipmentRack' : word;
      e = W.add('IFCELEMENTASSEMBLY', id, oh, nm, null, rackWord, pl, null, null, enumv('NOTDEFINED'), enumv('USERDEFINED'));
    } else e = W.add('IFCGROUP', id, oh, nm, null, word);
    const m = { ref: e, gid: id, kind: r.kind, placement: pl, role: r };
    if (r.kind === 'building') {
      const sid = gid('group', String(g.id), 'storey');
      m.storey = W.add('IFCBUILDINGSTOREY', sid, oh, `${nm} storey`, null, null, W.add('IFCLOCALPLACEMENT', pl, origin), null, null, enumv('ELEMENT'), real(0));
      m.storeyGid = sid;
    }
    made.set(g.id, m);
    const padding = num(g.padding);
    pset('APK_Group', id, e, [
      prop('GroupId', int(num(g.id) ?? 0)),
      byParent(r) ? prop('ParentId', int(num(r.parent.g.id) ?? 0)) : null,
      prop('Classification', label(word)),
      g.color ? prop('Colour', label(g.color)) : null,
      g.style ? prop('LineStyle', label(g.style)) : null,
      padding != null ? prop('Padding', int(padding)) : null,
    ]);
  }

  // ---- the relationships, one per (kind, parent)
  const buckets = new Map();
  const put = (kind, hostKey, host, child) => {
    const k = `${kind}|${hostKey}`;
    if (!buckets.has(k)) buckets.set(k, { kind, hostKey, host, list: [] });
    buckets.get(k).list.push(child);
  };
  const spatialRoots = [];
  for (const r of roles) {
    const m = made.get(r.g.id);
    const parent = r.parent ? made.get(r.parent.g.id) : null;
    if (parent && parent.kind === 'group') put('group', parent.gid, parent.ref, m.ref);
    if (m.kind in RANK) {
      const sp = r.spatialParent ? made.get(r.spatialParent.g.id) : null;
      if (!sp) spatialRoots.push(m.ref);
      else if (sp.kind === 'building' && m.kind === 'space') put('aggregates', sp.storeyGid, sp.storey, m.ref);
      else put('aggregates', sp.gid, sp.ref, m.ref);
    } else if (m.kind === 'rack') {
      const pp = r.productParent ? made.get(r.productParent.g.id) : null;
      if (pp && pp.kind === 'rack') put('aggregates', pp.gid, pp.ref, m.ref);
      else if (pp && pp.kind === 'building') put('contains', pp.storeyGid, pp.storey, m.ref);
      else if (pp) put('contains', pp.gid, pp.ref, m.ref);
    } else if (parent && parent.kind !== 'group') {
      put('product', parent.gid, parent.ref, m.ref);
    }
  }
  for (const m of made.values()) if (m.storey) put('aggregates', m.gid, m.ref, m.storey);
  if (spatialRoots.length) W.add('IFCRELAGGREGATES', rel('aggregates', P), oh, null, null, project, spatialRoots);
  const sorted = [...buckets.values()].sort((a, z) => (a.kind + a.hostKey < z.kind + z.hostKey ? -1 : 1));
  for (const { kind, hostKey, host, list } of sorted) {
    if (kind === 'aggregates') W.add('IFCRELAGGREGATES', rel('aggregates', hostKey), oh, null, null, host, list);
    else if (kind === 'contains') W.add('IFCRELCONTAINEDINSPATIALSTRUCTURE', rel('contains', hostKey), oh, null, null, list, host);
    else if (kind === 'group') W.add('IFCRELASSIGNSTOGROUP', rel('group', hostKey), oh, null, null, list, null, host);
    else W.add('IFCRELASSIGNSTOPRODUCT', rel('product', hostKey), oh, null, null, list, null, host);
  }
  for (const [g, owner, ps] of defs) W.add('IFCRELDEFINESBYPROPERTIES', g, oh, null, null, [owner], ps);

  return writeStep({
    header: [
      { type: 'FILE_DESCRIPTION', args: [['ViewDefinition [ReferenceView]'], '2;1'] },
      { type: 'FILE_NAME', args: [`${stem}.ifc`, STAMP, ['APK.audio'], ['APK.audio'], 'APK.audio group editor', 'EDITORS.GroupBuddy', ''] },
      { type: 'FILE_SCHEMA', args: [[GROUP_IFC_SCHEMA]] },
    ],
    entities: W.entities,
  });
}

/* ───────────────────────── reading it back ───────────────────────── */

/** The schema an .ifc text declares (FILE_SCHEMA), '' when none. */
export function schemaOf(text) {
  const m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(String(text || ''));
  return m ? m[1] : '';
}

const WORD = { IFCSITE: 'Campus', IFCBUILDING: 'Building', IFCSPACE: 'Room', IFCELEMENTASSEMBLY: 'Rack', IFCGROUP: 'Zone', IFCZONE: 'Zone', IFCSPATIALZONE: 'Zone' };

/**
 * An IFC model → the containment block. Every group is an entity with APK_Group, else (a file from another
 * tool) every site, building, space, rack-like assembly and group; throws a sentence when there is none.
 */
export function groupsFromIfc(text) {
  const file = parseStep(String(text));
  const get = (v) => (isRef(v) ? file.byId.get(v.id) : undefined);
  const refs = (v) => (Array.isArray(v) ? v : [v]).map(get).filter(Boolean);
  const types = ['IFCSITE', 'IFCBUILDING', 'IFCSPACE', 'IFCELEMENTASSEMBLY', 'IFCGROUP', 'IFCZONE', 'IFCSPATIALZONE'];
  const all = types.flatMap((t) => entitiesByType(file, t)).sort((a, z) => a.id - z.id);
  const tagged = all.filter((e) => getPsets(file, e).APK_Group);
  const nodes = tagged.length ? tagged : all;
  if (!nodes.length) throw new TypeError('no groups in this IFC: it has no IfcSite, IfcBuilding, IfcSpace, IfcElementAssembly or IfcGroup');
  const project = entitiesByType(file, 'IFCPROJECT')[0];

  // the structural parent of each entity: aggregated by, contained in, member of, assigned to
  const up = new Map();
  const link = (child, parent) => { if (child && parent && !up.has(child.id)) up.set(child.id, parent); };
  for (const r of entitiesByType(file, 'IFCRELASSIGNSTOGROUP')) for (const c of refs(r.args[4])) link(c, get(r.args[6]));
  for (const r of entitiesByType(file, 'IFCRELASSIGNSTOPRODUCT')) for (const c of refs(r.args[4])) link(c, get(r.args[6]));
  for (const r of entitiesByType(file, 'IFCRELAGGREGATES')) for (const c of refs(r.args[5])) link(c, get(r.args[4]));
  for (const r of entitiesByType(file, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')) for (const c of refs(r.args[4])) link(c, get(r.args[5]));
  const isNode = new Set(nodes.map((e) => e.id));

  const ids = new Map();
  let next = 1;
  const rows = nodes.map((e) => {
    const g = getPsets(file, e).APK_Group || {};
    const id = num(g.GroupId);
    return { e, g, id };
  });
  for (const r of rows) if (r.id != null) next = Math.max(next, r.id + 1);
  for (const r of rows) { if (r.id == null) r.id = next++; ids.set(r.e.id, r.id); }
  const groups = rows.map(({ e, g, id }) => {
    let parentId = num(g.ParentId);
    if (parentId == null) {
      let p = up.get(e.id);
      while (p && !isNode.has(p.id)) p = up.get(p.id);
      parentId = p ? ids.get(p.id) : null;
    }
    const out = {
      id,
      name: str(e.args[2]),
      type: str(g.Classification) || (e.type === 'IFCELEMENTASSEMBLY' && str(e.args[4]) !== 'EquipmentRack' && e.args[4] ? str(e.args[4]) : WORD[e.type]),
      parentId: parentId ?? null,
    };
    if (g.Colour) out.color = str(g.Colour);
    if (g.LineStyle) out.style = str(g.LineStyle);
    const padding = num(g.Padding);
    if (padding != null) out.padding = padding;
    return out;
  });
  const apk = project ? getPsets(file, project).APK_GroupContainment || {} : {};
  const name = project ? str(project.args[2]) : '';
  const nextId = num(apk.NextId);
  return {
    type: 'group_containment',
    id: str(apk.BlockId) || `group_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    name,
    nextId: nextId ?? Math.max(0, ...groups.map((g) => g.id)) + 1,
    groups,
  };
}
