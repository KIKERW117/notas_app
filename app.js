// ===== Notas Moradas — lógica de la app =====
// Todo se guarda en localStorage: funciona 100% sin conexión y sin servidor.

const STORAGE_KEY = 'notasMoradas.notes.v1';
const SUBJECTS_KEY = 'notasMoradas.subjects.v1';
const THEME_KEY = 'notasMoradas.theme.v1';
const THEMES = ['violeta', 'neon', 'medianoche'];
const SUBJECT_PALETTE = ['#a855f7', '#f472b6', '#38bdf8', '#4ade80', '#fbbf24', '#fb923c', '#f87171', '#818cf8'];

let notes = [];
let subjects = []; // [{ id, name, color }]
let currentId = null;
let currentFilter = 'all';
let currentSubjectFilter = null; // id de materia, o null = todas

// ---------- Utilidades ----------
const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    notes = raw ? JSON.parse(raw) : [];
    notes.forEach(n => {
      if (!Array.isArray(n.checklist)) n.checklist = [];
      if (n.subjectId === undefined) n.subjectId = null;
      if (n.dueDate === undefined) n.dueDate = null;
    });
  } catch (e) {
    console.error('No se pudieron leer las notas guardadas:', e);
    notes = [];
  }
}

function saveNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function loadSubjects() {
  try {
    const raw = localStorage.getItem(SUBJECTS_KEY);
    subjects = raw ? JSON.parse(raw) : [];
  } catch (e) {
    subjects = [];
  }
}

function saveSubjects() {
  localStorage.setItem(SUBJECTS_KEY, JSON.stringify(subjects));
}

function getSubject(id) {
  return subjects.find(s => s.id === id) || null;
}

function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// Compara solo por día calendario (ignora horas) para fecha límite
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  return Math.round((due - today) / 86400000);
}

function dueBadgeInfo(dateStr) {
  const diff = daysUntil(dateStr);
  if (diff === null) return null;
  const [y, m, d] = dateStr.split('-');
  const label = `${d}/${m}`;
  if (diff < 0) return { cls: 'due-overdue', text: `Vencida (${label})` };
  if (diff === 0) return { cls: 'due-soon', text: `Vence hoy` };
  if (diff === 1) return { cls: 'due-soon', text: `Vence mañana` };
  if (diff <= 3) return { cls: 'due-soon', text: `Vence en ${diff} días` };
  return { cls: '', text: `Entrega: ${label}` };
}

// ---------- Render: materias ----------
function renderSubjectChips() {
  const wrap = $('#subjectChips');
  wrap.innerHTML = '';
  subjects.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'subject-chip' + (currentSubjectFilter === s.id ? ' active' : '');
    btn.style.color = currentSubjectFilter === s.id ? s.color : '';
    btn.innerHTML = `<span class="dot" style="background:${s.color}"></span>${escapeHtml(s.name)}`;
    btn.addEventListener('click', () => {
      currentSubjectFilter = currentSubjectFilter === s.id ? null : s.id;
      renderSubjectChips();
      renderList();
    });
    wrap.appendChild(btn);
  });
}

function renderSubjectSelect() {
  const sel = $('#subjectSelect');
  const prev = sel.value;
  sel.innerHTML = '<option value="">Sin materia</option>' +
    subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  sel.value = prev;
}

function addSubject(name) {
  const clean = name.trim();
  if (!clean) return null;
  const existing = subjects.find(s => s.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const color = SUBJECT_PALETTE[subjects.length % SUBJECT_PALETTE.length];
  const subject = { id: uid(), name: clean, color };
  subjects.push(subject);
  saveSubjects();
  renderSubjectChips();
  renderSubjectSelect();
  return subject;
}

// ---------- Render: lista de notas ----------
function getVisibleNotes() {
  const q = $('#searchInput').value.trim().toLowerCase();
  let list = notes.filter(n => !n.deleted);

  if (currentFilter === 'pinned') list = list.filter(n => n.pinned);
  if (currentFilter === 'pendientes') {
    list = list.filter(n => n.dueDate || (n.checklist && n.checklist.some(i => !i.done)));
  }
  if (currentSubjectFilter) list = list.filter(n => n.subjectId === currentSubjectFilter);

  if (q) {
    list = list.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.body || '').toLowerCase().includes(q)
    );
  }

  if (currentFilter === 'pendientes') {
    return list.sort((a, b) => {
      const da = a.dueDate ? daysUntil(a.dueDate) : Infinity;
      const db = b.dueDate ? daysUntil(b.dueDate) : Infinity;
      return da - db;
    });
  }

  return list.sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
}

function renderList() {
  const listEl = $('#notesList');
  const trashEl = $('#trashList');
  listEl.innerHTML = '';
  trashEl.innerHTML = '';

  if (currentFilter === 'trash') {
    listEl.classList.add('hidden');
    $('#trashView').classList.remove('hidden');
    $('#editorEmpty').classList.add('hidden');
    $('#editorContent').classList.add('hidden');

    const trashed = notes.filter(n => n.deleted).sort((a, b) => b.deletedAt - a.deletedAt);
    if (!trashed.length) {
      trashEl.innerHTML = '<p class="empty-state">La papelera está vacía.</p>';
    }
    trashed.forEach(n => {
      const li = document.createElement('li');
      li.className = 'note-card trash-card';
      li.innerHTML = `
        <div>
          <h3>${escapeHtml(n.title || 'Sin título')}</h3>
          <span class="card-date">Eliminada el ${formatDate(n.deletedAt)}</span>
        </div>
        <div class="trash-actions">
          <button data-action="restore" data-id="${n.id}">Restaurar</button>
          <button data-action="wipe" data-id="${n.id}">Borrar ya</button>
        </div>`;
      trashEl.appendChild(li);
    });
    return;
  } else {
    listEl.classList.remove('hidden');
    $('#trashView').classList.add('hidden');
  }

  const visible = getVisibleNotes();
  $('#emptyState').classList.toggle('hidden', visible.length > 0);

  visible.forEach(n => {
    const li = document.createElement('li');
    li.className = 'note-card' + (n.id === currentId ? ' selected' : '') + (n.pinned ? ' pinned' : '');
    li.dataset.id = n.id;

    const subject = n.subjectId ? getSubject(n.subjectId) : null;
    if (subject) li.style.borderLeftColor = subject.color;

    let badges = '';
    if (subject) badges += `<span class="badge" style="border-color:${subject.color};color:${subject.color}">${escapeHtml(subject.name)}</span>`;
    if (n.dueDate) {
      const info = dueBadgeInfo(n.dueDate);
      badges += `<span class="badge ${info.cls}">${info.text}</span>`;
    }
    const pending = (n.checklist || []).filter(i => !i.done).length;
    const total = (n.checklist || []).length;
    if (total > 0) badges += `<span class="badge checklist">☑ ${total - pending}/${total}</span>`;

    li.innerHTML = `
      <h3>${escapeHtml(n.title || 'Sin título')}</h3>
      <p>${escapeHtml((n.body || '').slice(0, 140))}</p>
      <span class="card-date">${formatDate(n.updatedAt)}</span>
      ${badges ? `<div class="card-badges">${badges}</div>` : ''}`;
    li.addEventListener('click', () => selectNote(n.id));
    listEl.appendChild(li);
  });

  // si la nota seleccionada ya no está visible en este filtro (se
  // eliminó, se fue de la lista, etc.), limpia la selección SIN volver
  // a llamar renderList (evita un bucle infinito que trababa la app)
  if (currentId !== null && !visible.some(n => n.id === currentId) && currentFilter !== 'trash') {
    currentId = null;
    $('#editorEmpty').classList.remove('hidden');
    $('#editorContent').classList.add('hidden');
    showListMobile();
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Render: editor ----------
function renderChecklist(note) {
  const listEl = $('#checklistItems');
  listEl.innerHTML = '';
  const items = note.checklist || [];
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'checklist-item' + (item.done ? ' done' : '');
    li.innerHTML = `
      <input type="checkbox" ${item.done ? 'checked' : ''} data-id="${item.id}">
      <span>${escapeHtml(item.text)}</span>
      <button class="remove-item" data-id="${item.id}" title="Quitar">✕</button>`;
    listEl.appendChild(li);
  });
  const pending = items.filter(i => !i.done).length;
  $('#checklistProgress').textContent = items.length
    ? `Pendientes de esta nota (${items.length - pending}/${items.length})`
    : 'Pendientes de esta nota';
}

function renderEditor() {
  const note = notes.find(n => n.id === currentId && !n.deleted);
  if (!note) {
    openEditorFor(null);
    return;
  }
  $('#editorEmpty').classList.add('hidden');
  $('#editorContent').classList.remove('hidden');
  $('#noteTitle').value = note.title || '';
  $('#noteBody').value = note.body || '';
  $('#noteDate').textContent = 'Editado: ' + formatDate(note.updatedAt);
  $('#noteChars').textContent = (note.body || '').length + ' caracteres';
  $('#pinMenuItem').textContent = note.pinned ? '📌 Quitar de fijadas' : '📌 Fijar nota';
  renderSubjectSelect();
  $('#subjectSelect').value = note.subjectId || '';
  $('#dueDateInput').value = note.dueDate || '';
  renderChecklist(note);
}

function openEditorFor(id) {
  currentId = id;
  if (id === null) {
    $('#editorEmpty').classList.remove('hidden');
    $('#editorContent').classList.add('hidden');
  } else {
    renderEditor();
  }
  renderList();
}

function showEditorMobile() {
  document.body.classList.add('mobile-editor-open');
  $('#editor').classList.add('editor-open');
  $('#sidebar').classList.add('editor-open');
}

function showListMobile() {
  document.body.classList.remove('mobile-editor-open');
  $('#editor').classList.remove('editor-open');
  $('#sidebar').classList.remove('editor-open');
}

function selectNote(id) {
  currentId = id;
  renderEditor();
  renderList();
  // navegación móvil: mostrar el editor a pantalla completa
  showEditorMobile();
  // engancha el botón atrás del celular: en vez de salir de la app,
  // que regrese a la lista de notas
  if (!(history.state && history.state.notasMoradasView === 'editor')) {
    history.pushState({ notasMoradasView: 'editor' }, '');
  }
}

// ---------- Acciones sobre notas ----------
function createNote() {
  const note = {
    id: uid(),
    title: '',
    body: '',
    pinned: false,
    deleted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    subjectId: currentSubjectFilter || null,
    dueDate: null,
    checklist: [],
  };
  notes.unshift(note);
  saveNotes();
  currentFilter = 'all';
  updateFilterChips();
  selectNote(note.id);
  $('#noteTitle').focus();
}

function updateCurrentNote() {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  note.title = $('#noteTitle').value;
  note.body = $('#noteBody').value;
  note.updatedAt = Date.now();
  saveNotes();
  $('#noteDate').textContent = 'Editado: ' + formatDate(note.updatedAt);
  $('#noteChars').textContent = (note.body || '').length + ' caracteres';
  renderList();
}

function togglePin() {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  note.pinned = !note.pinned;
  saveNotes();
  renderEditor();
  renderList();
}

function deleteCurrentNote() {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  note.deleted = true;
  note.deletedAt = Date.now();
  saveNotes();
  showToast('Nota movida a la papelera');
  openEditorFor(null);
}

function restoreNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  note.deleted = false;
  note.deletedAt = null;
  saveNotes();
  showToast('Nota restaurada');
  renderList();
}

function wipeNote(id) {
  notes = notes.filter(n => n.id !== id);
  saveNotes();
  renderList();
}

// ---------- Materia y fecha límite ----------
function updateSubjectForCurrentNote(subjectId) {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  note.subjectId = subjectId || null;
  note.updatedAt = Date.now();
  saveNotes();
  renderList();
}

function updateDueDateForCurrentNote(dateStr) {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  note.dueDate = dateStr || null;
  note.updatedAt = Date.now();
  saveNotes();
  renderList();
}

// ---------- Checklist / pendientes de una nota ----------
function addChecklistItem(text) {
  const clean = text.trim();
  if (!clean) return;
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  if (!Array.isArray(note.checklist)) note.checklist = [];
  note.checklist.push({ id: uid(), text: clean, done: false });
  note.updatedAt = Date.now();
  saveNotes();
  renderChecklist(note);
  renderList();
}

function toggleChecklistItem(itemId) {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  const item = (note.checklist || []).find(i => i.id === itemId);
  if (!item) return;
  item.done = !item.done;
  note.updatedAt = Date.now();
  saveNotes();
  renderChecklist(note);
  renderList();
}

function removeChecklistItem(itemId) {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  note.checklist = (note.checklist || []).filter(i => i.id !== itemId);
  note.updatedAt = Date.now();
  saveNotes();
  renderChecklist(note);
  renderList();
}

// ---------- Exportar / Importar ----------
function exportNotes() {
  const data = JSON.stringify({ exportedAt: new Date().toISOString(), notes, subjects }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notas-moradas-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Notas exportadas');
}

function importNotesFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = Array.isArray(parsed) ? parsed : parsed.notes;
      if (!Array.isArray(incoming)) throw new Error('Formato inválido');

      // importa materias también, fusionando por nombre
      const incomingSubjects = Array.isArray(parsed.subjects) ? parsed.subjects : [];
      const idRemap = {};
      incomingSubjects.forEach(s => {
        if (!s || !s.name) return;
        const existing = subjects.find(x => x.name.toLowerCase() === s.name.toLowerCase());
        if (existing) {
          idRemap[s.id] = existing.id;
        } else {
          const color = s.color || SUBJECT_PALETTE[subjects.length % SUBJECT_PALETTE.length];
          const created = { id: uid(), name: s.name, color };
          subjects.push(created);
          idRemap[s.id] = created.id;
        }
      });
      saveSubjects();

      // fusiona notas por id; si el id ya existe, se agrega como copia nueva
      const existingIds = new Set(notes.map(n => n.id));
      incoming.forEach(n => {
        if (!n || typeof n !== 'object') return;
        const clean = {
          id: existingIds.has(n.id) ? uid() : (n.id || uid()),
          title: n.title || '',
          body: n.body || '',
          pinned: !!n.pinned,
          deleted: !!n.deleted,
          createdAt: n.createdAt || Date.now(),
          updatedAt: n.updatedAt || Date.now(),
          deletedAt: n.deletedAt || null,
          subjectId: n.subjectId ? (idRemap[n.subjectId] || null) : null,
          dueDate: n.dueDate || null,
          checklist: Array.isArray(n.checklist) ? n.checklist : [],
        };
        notes.push(clean);
      });
      saveNotes();
      renderSubjectChips();
      renderList();
      showToast(`Se importaron ${incoming.length} nota(s)`);
    } catch (e) {
      showToast('El archivo no es un respaldo válido');
      console.error(e);
    }
  };
  reader.readAsText(file);
}

// ---------- Compartir ----------
async function shareCurrentNote() {
  const note = notes.find(n => n.id === currentId);
  if (!note) return;
  let text = `${note.title || 'Nota'}\n\n${note.body || ''}`;
  const pending = (note.checklist || []);
  if (pending.length) {
    text += '\n\nPendientes:\n' + pending.map(i => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('\n');
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: note.title || 'Nota', text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // el usuario canceló
    }
  }
  // Alternativa: copiar al portapapeles
  try {
    await navigator.clipboard.writeText(text);
    showToast('Nota copiada al portapapeles');
  } catch (e) {
    showToast('No se pudo compartir en este navegador');
  }
}

// ---------- Temas ----------
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function cycleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'violeta';
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  applyTheme(next);
  showToast('Tono: ' + next.charAt(0).toUpperCase() + next.slice(1));
}

// ---------- Filtros ----------
function updateFilterChips() {
  document.querySelectorAll('.chip[data-filter]').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === currentFilter);
  });
}

// ---------- Eventos ----------
function initEvents() {
  $('#newNoteBtn').addEventListener('click', createNote);

  $('#menuBtn').addEventListener('click', () => {
    $('#menuPanel').classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#menuPanel') && !e.target.closest('#menuBtn')) {
      $('#menuPanel').classList.add('hidden');
    }
  });

  $('#exportBtn').addEventListener('click', () => { exportNotes(); $('#menuPanel').classList.add('hidden'); });
  $('#importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importNotesFromFile(file);
    e.target.value = '';
    $('#menuPanel').classList.add('hidden');
  });
  $('#themeToggleBtn').addEventListener('click', () => { cycleTheme(); $('#menuPanel').classList.add('hidden'); });

  $('#searchInput').addEventListener('input', renderList);

  document.querySelectorAll('.chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      updateFilterChips();
      if (currentFilter !== 'trash' && currentId === null) openEditorFor(null);
      renderList();
    });
  });

  $('#addSubjectChipBtn').addEventListener('click', () => {
    const name = prompt('¿Nombre de la materia? (ej. Cálculo, Historia, Programación)');
    if (name) {
      const subject = addSubject(name);
      if (subject) {
        currentSubjectFilter = subject.id;
        renderSubjectChips();
        renderList();
      }
    }
  });

  let saveTimer;
  $('#noteTitle').addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(updateCurrentNote, 250); });
  $('#noteBody').addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(updateCurrentNote, 250); });

  $('#subjectSelect').addEventListener('change', (e) => updateSubjectForCurrentNote(e.target.value));
  $('#dueDateInput').addEventListener('change', (e) => updateDueDateForCurrentNote(e.target.value));
  $('#clearDueBtn').addEventListener('click', () => {
    $('#dueDateInput').value = '';
    updateDueDateForCurrentNote(null);
  });

  $('#toggleChecklistInput').addEventListener('click', () => {
    $('#checklistInputRow').classList.toggle('hidden');
    if (!$('#checklistInputRow').classList.contains('hidden')) $('#checklistInput').focus();
  });
  $('#checklistAddBtn').addEventListener('click', () => {
    addChecklistItem($('#checklistInput').value);
    $('#checklistInput').value = '';
    $('#checklistInput').focus();
  });
  $('#checklistInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addChecklistItem($('#checklistInput').value);
      $('#checklistInput').value = '';
    }
  });
  $('#checklistItems').addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.remove-item');
    if (removeBtn) { removeChecklistItem(removeBtn.dataset.id); return; }
    if (e.target.matches('input[type="checkbox"]')) toggleChecklistItem(e.target.dataset.id);
  });

  $('#noteMenuBtn').addEventListener('click', () => {
    $('#noteMenuPanel').classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#noteMenuPanel') && !e.target.closest('#noteMenuBtn')) {
      $('#noteMenuPanel').classList.add('hidden');
    }
  });
  $('#pinMenuItem').addEventListener('click', () => { togglePin(); $('#noteMenuPanel').classList.add('hidden'); });
  $('#shareMenuItem').addEventListener('click', () => { shareCurrentNote(); $('#noteMenuPanel').classList.add('hidden'); });
  $('#deleteMenuItem').addEventListener('click', () => { deleteCurrentNote(); $('#noteMenuPanel').classList.add('hidden'); });

  $('#backToListBtn').addEventListener('click', () => {
    // usa el historial para que sea el mismo camino que el botón
    // atrás físico/gesto del celular
    if (history.state && history.state.notasMoradasView === 'editor') {
      history.back();
    } else {
      showListMobile();
    }
  });

  $('#trashList').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'restore') restoreNote(id);
    if (btn.dataset.action === 'wipe') wipeNote(id);
  });
}

// ---------- Navegación con el botón atrás del sistema ----------
// Sin esto, el botón atrás de Android cierra la app entera en vez de
// regresar a la lista de notas. Al marcar un estado en el historial
// cuando se abre una nota, el botón atrás solo "gasta" ese estado
// (vuelve a la lista) y recién en un segundo toque sale de la app,
// igual que cualquier otra app nativa.
function initBackButtonHandling() {
  if (!history.state) {
    history.replaceState({ notasMoradasView: 'list' }, '');
  }
  window.addEventListener('popstate', (event) => {
    const view = event.state && event.state.notasMoradasView;
    if (view !== 'editor') {
      showListMobile();
    }
  });
}

// ---------- Arranque ----------
function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'violeta');
  loadNotes();
  loadSubjects();
  initEvents();
  initBackButtonHandling();
  renderSubjectChips();
  renderSubjectSelect();
  renderList();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
