// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import { GroupHierarchyModel } from './groupModel.js';
import { BlockBridge } from './blockBridge.js';

export { GroupHierarchyModel };

export class GroupApp {
  constructor() {
    this.model = new GroupHierarchyModel();
    this.bridge = new BlockBridge({
      name: 'Group Buddy',
      type: 'group_containment',
      onBlockLoaded: (b, m) => this.handleBlockLoaded(b, m),
      onBlockChanged: () => this.render()
    });

    this.tableBody = document.getElementById('group-table-body');
    this.svgContainer = document.getElementById('containment-svg');
    this.initControls();
    this.render();
    this.autoConnect();
  }

  async autoConnect() {
    const discovered = await this.bridge.fetchDiscoveredProject();
    if (discovered && discovered.containment && discovered.containment.length > 0) {
      this.model.fromBlock(discovered.containment[0]);
      this.render();
    }
  }

  handleBlockLoaded(block, meta) {
    if (block) {
      this.model.fromBlock(block);
      this.render();
    }
  }

  initControls() {
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        this.bridge.saveBlock(this.model.toBlock(), { name: this.model.name });
      });
    }

    const btnOpen = document.getElementById('btn-open');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const data = JSON.parse(evt.target.result);
              this.model.fromBlock(data);
              this.render();
            } catch (err) {
              alert('Invalid block file: ' + err.message);
            }
          };
          reader.readAsText(file);
        };
        input.click();
      });
    }

    const btnClose = document.getElementById('btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.bridge.close());
    }

    const btnDiscovered = document.getElementById('btn-discovered');
    if (btnDiscovered) {
      btnDiscovered.addEventListener('click', async () => {
        const disc = await this.bridge.fetchDiscoveredProject();
        if (disc && disc.containment && disc.containment.length > 0) {
          this.model.fromBlock(disc.containment[0]);
          this.render();
        } else {
          alert('No containment blocks found in current discovered project.');
        }
      });
    }

    const btnAddGroup = document.getElementById('btn-add-group');
    if (btnAddGroup) {
      btnAddGroup.addEventListener('click', () => {
        this.model.addGroup('NEW-ZONE', 'Zone', null, '#a855f7', 'dashed', 16);
        this.render();
        this.bridge.notifyChanged();
      });
    }

    const propName = document.getElementById('prop-name');
    if (propName) {
      propName.addEventListener('input', (e) => {
        this.model.name = e.target.value;
        this.bridge.notifyChanged();
      });
    }
  }

  render() {
    const propName = document.getElementById('prop-name');
    if (propName) {
      propName.value = this.model.name;
    }

    this.renderTable();
    this.renderSvg();
  }

  renderTable() {
    if (!this.tableBody) return;
    this.tableBody.innerHTML = '';

    const parentOptions = (currentId, selectedParentId) => {
      let opts = '<option value="">(None - Root)</option>';
      this.model.groups.forEach(g => {
        if (g.id !== currentId) {
          opts += `<option value="${g.id}" ${g.id === selectedParentId ? 'selected' : ''}>${g.name} [${g.type}]</option>`;
        }
      });
      return opts;
    };

    this.model.groups.forEach((g) => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td style="color: var(--text-muted); font-size: 11px;">#${g.id}</td>
        <td class="inline-cell" contenteditable="true" data-id="${g.id}" data-field="name">${g.name}</td>
        <td>
          <select class="control-select" data-id="${g.id}" data-field="type">
            <option value="Campus" ${g.type === 'Campus' ? 'selected' : ''}>Campus</option>
            <option value="Building" ${g.type === 'Building' ? 'selected' : ''}>Building</option>
            <option value="Room" ${g.type === 'Room' ? 'selected' : ''}>Room</option>
            <option value="Zone" ${g.type === 'Zone' ? 'selected' : ''}>Zone</option>
            <option value="Rack" ${g.type === 'Rack' ? 'selected' : ''}>Rack</option>
            <option value="Bay" ${g.type === 'Bay' ? 'selected' : ''}>Bay</option>
            <option value="Sub-System" ${g.type === 'Sub-System' ? 'selected' : ''}>Sub-System</option>
            <option value="Boundary" ${g.type === 'Boundary' ? 'selected' : ''}>Boundary</option>
          </select>
        </td>
        <td>
          <select class="control-select" data-id="${g.id}" data-field="parentId">
            ${parentOptions(g.id, g.parentId)}
          </select>
        </td>
        <td>
          <input type="color" value="${g.color || '#38bdf8'}" data-id="${g.id}" data-field="color" style="width: 40px; height: 24px; border: none; background: transparent; cursor: pointer;">
        </td>
        <td>
          <select class="control-select" data-id="${g.id}" data-field="style">
            <option value="solid" ${g.style === 'solid' ? 'selected' : ''}>Solid</option>
            <option value="dashed" ${g.style === 'dashed' ? 'selected' : ''}>Dashed</option>
            <option value="dotted" ${g.style === 'dotted' ? 'selected' : ''}>Dotted</option>
          </select>
        </td>
        <td class="inline-cell" contenteditable="true" data-id="${g.id}" data-field="padding">${g.padding || 16}</td>
        <td style="text-align: center;">
          <button class="btn-delete" data-id="${g.id}" title="Delete Group">✕</button>
        </td>
      `;

      this.tableBody.appendChild(tr);
    });

    this.tableBody.querySelectorAll('[contenteditable=true]').forEach(cell => {
      cell.addEventListener('blur', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const field = e.target.dataset.field;
        let val = e.target.innerText.trim();
        if (field === 'padding') val = parseInt(val, 10) || 16;
        this.model.updateGroup(id, field, val);
        this.renderSvg();
        this.bridge.notifyChanged();
      });
    });

    this.tableBody.querySelectorAll('select.control-select, input[type=color]').forEach(el => {
      el.addEventListener('change', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const field = e.target.dataset.field;
        let val = e.target.value;
        if (field === 'parentId') val = val === '' ? null : parseInt(val, 10);
        this.model.updateGroup(id, field, val);
        this.renderSvg();
        this.bridge.notifyChanged();
      });
    });

    this.tableBody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        this.model.removeGroup(id);
        this.render();
        this.bridge.notifyChanged();
      });
    });
  }

  renderSvg() {
    if (!this.svgContainer) return;

    const width = 640;
    const height = 300;

    // Render nested hierarchy boxes
    const roots = this.model.getChildren(null);
    let elementsSvg = '';

    const renderBox = (group, x, y, w, h) => {
      const strokeDash = group.style === 'dashed' ? 'stroke-dasharray="6 4"' : (group.style === 'dotted' ? 'stroke-dasharray="2 3"' : '');
      const children = this.model.getChildren(group.id);

      let inner = `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${group.color}" fill-opacity="0.08" stroke="${group.color}" stroke-width="1.5" ${strokeDash}/>
        <rect x="${x}" y="${y}" width="${Math.min(w, 140)}" height="22" rx="4" fill="${group.color}" fill-opacity="0.25"/>
        <text x="${x + 6}" y="${y + 15}" fill="#F0F4F8" font-size="10" font-weight="bold" font-family="JetBrains Mono, monospace">${group.name}</text>
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
        <rect x="0" y="0" width="${width}" height="${height}" fill="#080C16" rx="8"/>
        <!-- Background Grid -->
        <defs>
          <pattern id="groupGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#121A2F" stroke-width="1"/>
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
    new GroupApp();
  });
}
