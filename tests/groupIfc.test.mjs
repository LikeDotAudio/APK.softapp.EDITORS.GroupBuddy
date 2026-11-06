// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ROAD-3583: the containment block's .ifc twin (js/groupIfc.js) — written byte-deterministically, read back
// to the same block; Save Model standalone writes both files. IFC_OUT=<dir> npm test also writes the
// fixtures there, for IfcOpenShell validate + the BIM oracle (DATABASE.server.BIM editors_census.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GroupHierarchyModel } from '../js/groupModel.js';
import { groupsToIfc, groupsFromIfc, resolveGroups, kindOf, schemaOf } from '../js/groupIfc.js';
import { connectGroupHost, saveGroupModel } from '../js/groupHost.js';
import { world } from './hostWorld.mjs';

function out(name, text) {
  if (!process.env.IFC_OUT) return;
  mkdirSync(process.env.IFC_OUT, { recursive: true });
  writeFileSync(join(process.env.IFC_OUT, name), text);
}

/** The default studio, plus a zone with a rack and a booth in it, a room with no building, a sub-system in a rack. */
function venue() {
  const m = new GroupHierarchyModel();          // 1 campus > 2 building > 3 control room, 4 live room; 3 > 5 rack
  m.addGroup('FOH-ZONE', 'Zone', 4, '#a855f7', 'dashed', 16);     // 6
  m.addGroup('STAGE-RACK', 'Rack', 6, '#f59e0b', 'solid', 12);    // 7: a rack in a zone in a room
  m.addGroup('ISO-BOOTH', 'Room', 6, '#10b981', 'dotted', 10);    // 8: a room in a zone in a room
  m.addGroup('LOOSE-ROOM', 'Room', null);                         // 9: no building, so not an IfcSpace
  m.addGroup('DSP-CHAIN', 'Sub-System', 5, '#38bdf8', 'solid', 8); // 10: in the rack
  m.addGroup('SIDECAR', 'Bay', 5);                                // 11: a bay in the rack
  return m;
}

test('the same block writes the same bytes, and reads back to the same block', () => {
  const block = venue().toBlock();
  const a = groupsToIfc(block, { name: 'group_venue' });
  assert.equal(a, groupsToIfc(JSON.parse(JSON.stringify(block)), { name: 'group_venue' }));
  assert.match(a, /^ISO-10303-21;/);
  assert.equal(schemaOf(a), 'IFC4X3_ADD2');
  out('groups-venue.ifc', a);
  const b = groupsFromIfc(a);
  assert.deepEqual(b, block);
  assert.equal(groupsToIfc(b, { name: 'group_venue' }), a, 'read and written again: the same file');
});

test('IFC words where IFC allows them: site, building with a storey, spaces, racks, groups', () => {
  const a = groupsToIfc(venue().toBlock(), { name: 'g' });
  assert.match(a, /IFCSITE\('[^']+',#\d+,'CAMPUS-MAIN',\$,'Campus'/);
  assert.match(a, /IFCBUILDING\('[^']+',#\d+,'BUILDING-STUDIOS',\$,'Building'/);
  assert.match(a, /IFCBUILDINGSTOREY\('[^']+',#\d+,'BUILDING-STUDIOS storey'/);
  assert.match(a, /IFCSPACE\('[^']+',#\d+,'CONTROL-ROOM-A'/);
  assert.match(a, /IFCSPACE\('[^']+',#\d+,'ISO-BOOTH'/, 'a room in a zone in a room is still a space');
  assert.match(a, /IFCGROUP\('[^']+',#\d+,'LOOSE-ROOM',\$,'Room'\)/, 'a room with no building is a group');
  assert.match(a, /IFCELEMENTASSEMBLY\('[^']+',#\d+,'RACK-01',\$,'EquipmentRack',#\d+,\$,\$,\.NOTDEFINED\.,\.USERDEFINED\.\)/);
  assert.match(a, /IFCELEMENTASSEMBLY\('[^']+',#\d+,'SIDECAR',\$,'Bay'/);
  assert.match(a, /IFCGROUP\('[^']+',#\d+,'FOH-ZONE',\$,'Zone'\)/);
  assert.match(a, /IFCRELASSIGNSTOPRODUCT\(/, 'a zone in a room is assigned to the room');
  assert.match(a, /IFCRELASSIGNSTOGROUP\(/, 'the zone\'s members');
  assert.match(a, /IFCRELCONTAINEDINSPATIALSTRUCTURE\(/, 'racks in their room');
  assert.match(a, /'Padding',\$,IFCINTEGER\(16\)/);
});

test('the IFC roles follow the spatial order; a cycle or a missing parent is a root', () => {
  const roles = resolveGroups(venue().groups);
  const kind = Object.fromEntries(roles.map((r) => [r.g.name, r.kind]));
  assert.deepEqual(kind, {
    'CAMPUS-MAIN': 'site', 'BUILDING-STUDIOS': 'building', 'CONTROL-ROOM-A': 'space', 'LIVE-ROOM': 'space',
    'RACK-01': 'rack', 'FOH-ZONE': 'group', 'STAGE-RACK': 'rack', 'ISO-BOOTH': 'space', 'LOOSE-ROOM': 'group',
    'DSP-CHAIN': 'group', SIDECAR: 'rack',
  });
  const loop = resolveGroups([
    { id: 1, name: 'A', type: 'Building', parentId: 2 },
    { id: 2, name: 'B', type: 'Room', parentId: 1 },
    { id: 3, name: 'C', type: 'Room', parentId: 99 },
  ]);
  assert.equal(loop.filter((r) => !r.parent).length, 2);
  assert.equal(kindOf('campus'), 'site');
  assert.equal(kindOf('Boundary'), 'group');
  const block = { type: 'group_containment', id: 'group_loop', name: 'LOOP', nextId: 4, groups: loop.map((r) => r.g) };
  const a = groupsToIfc(block, { name: 'loop' });
  out('groups-loop.ifc', a);
  assert.equal(groupsFromIfc(a).groups.length, 3);
});

test('a file from another tool: the tree from its relationships', () => {
  // no APK_Group.ParentId (renamed out of the reader's sight): the relationships decide
  const a = groupsToIfc(venue().toBlock(), { name: 'g' }).replace(/'ParentId'/g, "'NotParentId'");
  const b = groupsFromIfc(a);
  const parent = Object.fromEntries(b.groups.map((g) => [g.name, b.groups.find((p) => p.id === g.parentId)?.name || null]));
  assert.equal(parent['ISO-BOOTH'], 'FOH-ZONE');
  assert.equal(parent['STAGE-RACK'], 'FOH-ZONE');
  assert.equal(parent['CONTROL-ROOM-A'], 'BUILDING-STUDIOS');
  assert.equal(parent['RACK-01'], 'CONTROL-ROOM-A');
  assert.equal(parent['DSP-CHAIN'], 'RACK-01');
});

test('not a containment model: a sentence, never a half-read block', () => {
  const a = 'ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((\'\'),\'2;1\');\nFILE_NAME(\'x\',\'\',(\'\'),(\'\'),\'\',\'\',\'\');\nFILE_SCHEMA((\'IFC4X3_ADD2\'));\nENDSEC;\nDATA;\n#1=IFCCARTESIANPOINT((0.,0.,0.));\nENDSEC;\nEND-ISO-10303-21;\n';
  assert.throws(() => groupsFromIfc(a), /no groups in this IFC/);
});

test('standalone Save Model: the .ifc twin and the .json, both downloaded', async () => {
  const { S, downloads } = world({ framed: false });
  const model = venue();
  const host = connectGroupHost(S, model, { notice: false });
  const via = await saveGroupModel(S, host, model);
  assert.equal(via, 'download');
  assert.deepEqual(downloads.map((d) => d.name), ['group_STUDIO-COMPLEX-CONTAINMENT.ifc', 'group_STUDIO-COMPLEX-CONTAINMENT.json']);
  assert.match(downloads[0].text, /^ISO-10303-21;/);
  assert.deepEqual(groupsFromIfc(downloads[0].text), JSON.parse(downloads[1].text));
});

test('inside the CAD, Save still returns the block to the drawing', async () => {
  const { S, toParent } = world();
  const model = venue();
  const host = connectGroupHost(S, model, { notice: false });
  await saveGroupModel(S, host, model);
  assert.equal(toParent.at(-1).m.type, 'blockSave');
});
