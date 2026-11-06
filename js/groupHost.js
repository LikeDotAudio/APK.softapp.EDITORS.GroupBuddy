// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// The containment block in and out of the CAD over cad.like.audio/host@1,
// through the vendored APKSoftapp client (vendor/apk-softapp/). No DOM here.

import { groupsToIfc } from './groupIfc.js';

export const EDITOR = 'Group Buddy';
export const BLOCK_TYPE = 'group_containment';

export function saveMeta(model) {
  return { blockName: model.name, filename: `group_${model.name}` };
}

/** One host@1 link for one GroupHierarchyModel. */
export function connectGroupHost(S, model, { onLoaded, notice } = {}) {
  return S.connectHost({
    editor: EDITOR,
    blockType: BLOCK_TYPE,
    block: model.toBlock(),
    notice,
    onLoad: (block, meta) => {
      model.fromBlock(block);
      if (onLoaded) onLoaded(block, meta);
    },
    onRequest: () => ({ block: model.toBlock(), meta: saveMeta(model) }),
  });
}

/**
 * Save: inside the CAD, the block back to the drawing (host.save); standalone, Save Model — the block's
 * .json AND its .ifc twin (js/groupIfc.js), both or neither. Resolves to 'cad' | 'download' | 'directory'
 * | '' (failed or cancelled; a failure shows its problem card).
 */
export async function saveGroupModel(S, host, model, { onRetry } = {}) {
  const block = model.toBlock();
  const meta = saveMeta(model);
  if (host.embedded || typeof S.saveModel !== 'function') return host.save(block, meta);
  const r = await S.saveModel(block, { name: meta.filename, toIfc: (b) => groupsToIfc(b, { name: meta.filename }) });
  if (!r.ok && !r.cancelled) S.showProblem(r.problem || 'save_failed', { onRetry });
  return r.ok ? r.via : '';
}

/** The parent choices for one group: none (root) or any group that is not it and not inside it. */
export function parentChoices(model, id) {
  const inside = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of model.groups) {
      if (!inside.has(g.id) && inside.has(g.parentId)) { inside.add(g.id); grew = true; }
    }
  }
  return model.groups.filter((g) => !inside.has(g.id));
}
