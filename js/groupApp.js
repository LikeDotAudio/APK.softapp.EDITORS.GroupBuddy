// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import { GroupHierarchyModel } from './groupModel.js';
import { connectGroupHost, saveMeta, saveGroupModel, parentChoices, EDITOR as EDITOR_NAME } from './groupHost.js';
import { groupsFromIfc, schemaOf } from './groupIfc.js';

export { GroupHierarchyModel };

const GROUP_TYPES = ['Campus', 'Building', 'Room', 'Zone', 'Rack', 'Bay', 'Sub-System', 'Boundary'];
const LINE_STYLES = ['solid', 'dashed', 'dotted'];

export class GroupApp {
  constructor(S) {
    this.S = S;
    this.esc = S.esc;
    this.model = new GroupHierarchyModel();
    this.svgContainer = document.getElementById('containment-svg');

    this.table = window.APKTable.create(document.getElementById('group-table'), {
      id: 'groupbuddy-groups',
      columns: [
        { key: 'id', label: 'ID', type: 'number', editable: false },
        { key: 'name', label: 'Group / Boundary Name' },
        { key: 'type', label: 'Classification', type: 'select', options: GROUP_TYPES },
        { key: 'parentId', label: 'Parent Enclosure', render: (v, row) => this.parentSelect(row) },
        { key: 'color', label: 'Tint', render: (v, row) => this.colorInput(row) },
        { key: 'style', label: 'Line Style', type: 'select', options: LINE_STYLES },
        { key: 'padding', label: 'Padding', type: 'number' },
      ],
      rows: this.model.groups,
      onEdit: (i, key, value, row) => {
        if (key === 'padding') value = parseInt(value, 10) || 16;
        this.model.updateGroup(row.id, key, value);
        this.render();
        this.changed();
      },
      onDelete: (i, row) => {
        this.model.removeGroup(row.id);
        this.render();
        this.changed();
      },
      empty: 'No spatial boundaries yet. Add one above.',
    });

    this.host = connectGroupHost(S, this.model, { onLoaded: () => this.render() });
    S.inheritTheme();
    S.describe({
      name: EDITOR_NAME,
      does: 'Draws nested spatial boundaries (campus, building, room, zone, rack…) and saves them as a containment block.',
      inputs: [
        { name: 'Containment block', from: 'the CAD block this editor was opened on (host@1 load)', kind: 'cad' },
        { name: 'Block file', from: 'Open Block: the .json or its .ifc twin (IFC4X3_ADD2)', kind: 'file' },
      ],
      outputs: [
        { name: 'Containment block', to: 'the CAD drawing on Save & Return; standalone, Save Model: group_<name>.json and its .ifc twin', kind: 'cad' },
        { name: 'Live edits', to: 'the CAD after every change (blockChanged)', kind: 'cad' },
      ],
      controls: [
        { name: '+ Add Spatial Boundary', how: 'adds a NEW-ZONE zone at the root' },
        { name: 'Table cells', how: 'edit name, classification, parent enclosure, tint, line style, padding; the row × deletes it' },
        { name: 'Containment Name', how: 'the block name and the download file name' },
        { name: 'Save & Return / ✕', how: 'save into the CAD (standalone: the .json and its .ifc) / close the editor' },
      ],
      problems: ['bad_json', 'bad_input', 'file_unreadable', 'not_in_cad', 'save_failed'],
    });
    this.initControls();
    this.render();
  }

  changed() { this.host.changed(this.model.toBlock(), saveMeta(this.model)); }

  /** Save & Return: into the CAD; standalone, Save Model — the .json and its .ifc twin (js/groupIfc.js). */
  save() {
    return saveGroupModel(this.S, this.host, this.model, { onRetry: () => this.save() });
  }

  /** Open: a containment block .json or an IFC model (.ifc; an ISO 10303-21 header decides for any other name). */
  async open() {
    const r = await this.S.openModel({ fromIfc: (text) => groupsFromIfc(text) });
    if (!r.ok) {
      if (!r.cancelled) this.S.showProblem(r.problem, {
        fix: ['Open a Group Buddy containment block (.json, blockType group_containment) or an .ifc with sites, buildings, spaces, assemblies or groups.'],
        onRetry: () => this.open(),
      });
      return;
    }
    if (r.kind === 'json' && (!r.model || !Array.isArray(r.model.groups))) {
      this.S.showProblem('bad_input', { subject: r.name, detail: 'no groups in this file', fix: ['Open a Group Buddy containment block (.json saved by this editor, blockType group_containment).'] });
      return;
    }
    this.model.fromBlock(r.model);
    if (r.kind === 'ifc') document.title = `${EDITOR_NAME} · ${r.name} · ${schemaOf(r.text)}`;
    this.render();
    this.changed();
  }

  parentSelect(row) {
    const sel = document.createElement('select');
    sel.className = 'apk-table-select';
    const add = (value, text) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = text;
      if (String(row.parentId ?? '') === value) o.selected = true;
      sel.appendChild(o);
    };
    add('', '(None - Root)');
    parentChoices(this.model, row.id).forEach((g) => add(String(g.id), `${g.name} [${g.type}]`));
    sel.onchange = () => {
      this.model.updateGroup(row.id, 'parentId', sel.value === '' ? null : parseInt(sel.value, 10));
      this.render();
      this.changed();
    };
    return sel;
  }

  colorInput(row) {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = /^#[0-9a-f]{6}$/i.test(row.color || '') ? row.color : '#38bdf8';
    input.style.cssText = 'width: 40px; height: 24px; border: none; background: transparent; cursor: pointer;';
    input.onchange = () => {
      this.model.updateGroup(row.id, 'color', input.value);
      this.renderSvg();
      this.changed();
    };
    return input;
  }

  initControls() {
    document.getElementById('btn-save')?.addEventListener('click', () => this.save());
    document.getElementById('btn-open')?.addEventListener('click', () => this.open());

    document.getElementById('btn-close')?.addEventListener('click', () => this.host.close());

    const btnAddGroup = document.getElementById('btn-add-group');
    if (btnAddGroup) {
      btnAddGroup.addEventListener('click', () => {
        this.model.addGroup('NEW-ZONE', 'Zone', null, '#a855f7', 'dashed', 16);
        this.render();
        this.changed();
      });
    }

    const propName = document.getElementById('prop-name');
    if (propName) {
      propName.addEventListener('input', (e) => {
        this.model.name = e.target.value;
        this.changed();
      });
    }
  }

  render() {
    const propName = document.getElementById('prop-name');
    if (propName) {
      propName.value = this.model.name;
    }

    this.table.setRows(this.model.groups);
    this.renderSvg();
  }

  renderSvg() {
    if (!this.svgContainer) return;

    const width = 640;
    const height = 300;

    // Render nested hierarchy boxes
    const roots = this.model.getChildren(null);
    let elementsSvg = '';

    const e = this.esc;
    const renderBox = (group, x, y, w, h) => {
      const color = /^#[0-9a-f]{3,8}$/i.test(group.color || '') ? group.color : '#38bdf8';
      const strokeDash = group.style === 'dashed' ? 'stroke-dasharray="6 4"' : (group.style === 'dotted' ? 'stroke-dasharray="2 3"' : '');
      const children = this.model.getChildren(group.id);

      let inner = `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-width="1.5" ${strokeDash}/>
        <rect x="${x}" y="${y}" width="${Math.min(w, 140)}" height="22" rx="4" fill="${color}" fill-opacity="0.25"/>
        <text x="${x + 6}" y="${y + 15}" fill="#f4f4f5" font-size="10" font-weight="bold" font-family="JetBrains Mono, monospace">${e(group.name)}</text>
      `;

      if (children.length > 0) {
        const pad = Math.min(group.padding || 16, 20);
        const childAvailW = w - pad * 2;
        const childW = Math.max(80, (childAvailW - (children.length - 1) * 10) / children.length);
        const childH = h - 35 - pad;

        children.forEach((child, idx) => {
          const cx = x + pad + idx * (childW + 10);
          const cy = y + 28;
          inner += renderBox(child, cx, cy, childW, childH);
        });
      }

      return inner;
    };

    if (roots.length > 0) {
      const rootW = (width - 40 - (roots.length - 1) * 16) / roots.length;
      roots.forEach((root, idx) => {
        const rx = 20 + idx * (rootW + 16);
        elementsSvg += renderBox(root, rx, 20, rootW, height - 40);
      });
    }

    const svg = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#121212" rx="8"/>
        <!-- Background Grid -->
        <defs>
          <pattern id="groupGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#18181b" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#groupGrid)" rx="8"/>

        ${elementsSvg}
      </svg>
    `;

    this.svgContainer.innerHTML = svg;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (!window.APKSoftapp || !window.APKTable) {
      document.body.prepend(Object.assign(document.createElement('p'), {
        textContent: 'vendor/apk-softapp or vendor/apk-table did not load: this editor cannot start.',
      }));
      return;
    }
    window.groupApp = new GroupApp(window.APKSoftapp);
  });
}
