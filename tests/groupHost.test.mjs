// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ROAD-3487: the containment block round trip over cad.like.audio/host@1,
// driven through the real vendored apk-softapp.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, ORIGIN, PROTOCOL } from './hostWorld.mjs';
import { GroupHierarchyModel } from '../js/groupModel.js';
import { connectGroupHost, parentChoices, BLOCK_TYPE } from '../js/groupHost.js';

test('in the CAD: editorReady, load fills the model, request saves the edited block to our origin only', () => {
  const { S, toParent, fire } = world();
  const model = new GroupHierarchyModel();
  connectGroupHost(S, model, { notice: false });
  assert.deepEqual(toParent[0], { m: { protocol: PROTOCOL, type: 'editorReady', editor: 'Group Buddy', blockType: BLOCK_TYPE }, o: ORIGIN });

  const cad = { type: BLOCK_TYPE, name: 'VENUE', nextId: 3, groups: [
    { id: 1, name: 'HALL', type: 'Building', parentId: null, color: '#3b82f6', style: 'solid', padding: 20 },
    { id: 2, name: 'FOH', type: 'Zone', parentId: 1, color: '#10b981', style: 'dashed', padding: 16 },
  ] };
  fire({ protocol: PROTOCOL, type: 'load', block: cad, meta: { blockName: 'VENUE' } });
  assert.equal(model.name, 'VENUE');
  assert.equal(model.groups.length, 2);

  model.addGroup('RACK-A', 'Rack', 2);
  fire({ protocol: PROTOCOL, type: 'request' });
  const save = toParent.at(-1);
  assert.equal(save.o, ORIGIN);
  assert.equal(save.m.type, 'blockSave');
  assert.deepEqual(save.m.block, model.toBlock());
  assert.equal(save.m.block.nextId, 4);
  assert.deepEqual(save.m.block.groups.map((g) => g.parentId), [null, 1, 2]);
});

test('standalone: Save downloads group_<name>.json', () => {
  const { S, downloads, toParent } = world({ framed: false });
  const model = new GroupHierarchyModel();
  const host = connectGroupHost(S, model, { notice: false });
  assert.equal(host.save(model.toBlock(), { filename: 'group_STUDIO' }), 'download');
  assert.equal(toParent.length, 0);
  assert.equal(downloads[0].name, 'group_STUDIO.json');
  assert.equal(JSON.parse(downloads[0].text).groups.length, 5);
});

test('a group cannot be put inside itself or anything it contains', () => {
  const model = new GroupHierarchyModel();   // 1 campus > 2 building > 3,4 rooms; 3 > 5 rack
  assert.deepEqual(parentChoices(model, 2).map((g) => g.id), [1]);
  assert.deepEqual(parentChoices(model, 5).map((g) => g.id), [1, 2, 3, 4]);
  assert.deepEqual(parentChoices(model, 1).map((g) => g.id), []);
});
