// ===== Notas Moradas — lógica de la app =====
// Todo se guarda en localStorage: funciona 100% sin conexión y sin servidor.

const STORAGE_KEY = 'notasMoradas.notes.v1';
const THEME_KEY = 'notasMoradas.theme.v1';
const THEMES = ['violeta', 'neon', 'medianoche'];

let notes = [];
let currentId = null;
let currentFilter = 'all';

// ---------- Utilidades ----------
const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    notes = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('No se pudieron leer las notas guardadas:', e);
    notes = [];
  }
}

function saveNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
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

// ---------- Render ----------
function getVisibleNotes() {
  const q = $('#searchInput').value.trim().toLowerCase();
  let list = notes.filter(n => !n.deleted);

  if (currentFilter === 'pinned') list = list.filter(n => n.pinned);

  if (q) {
    list = list.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.body || '').toLowerCase().includes(q)
    );
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
    li.innerHTML = `
      <h3>${escapeHtml(n.title || 'Sin título')}</h3>
      <p>${escapeHtml((n.body || '').slice(0, 140))}</p>
      <span class="card-date">${formatDate(n.updatedAt)}</span>`;
    li.addEventListener('click', () => selectNote(n.id));
    listEl.appendChild(li);
  });

  if (!visible.some(n => n.id === currentId)) {
    if (currentFilter !== 'trash') openEditorFor(null);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
  $('#pinBtn').classList.toggle('active', !!note.pinned);
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

function selectNote(id) {
  currentId = id;
  renderEditor();
  renderList();
  // navegación móvil: mostrar el editor a pantalla completa
  document.body.classList.add('mobile-editor-open');
  $('#editor').classList.add('editor-open');
  $('#sidebar').classList.add('editor-open');
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

// ---------- Exportar / Importar ----------
function exportNotes() {
  const data = JSON.stringify({ exportedAt: new Date().toISOString(), notes }, null, 2);
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

      // fusiona por id; si el id ya existe, se agrega como copia nueva
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
        };
        notes.push(clean);
      });
      saveNotes();
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
  const text = `${note.title || 'Nota'}\n\n${note.body || ''}`;

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
  document.querySelectorAll('.chip').forEach(c => {
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

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      updateFilterChips();
      if (currentFilter !== 'trash' && currentId === null) openEditorFor(null);
      renderList();
    });
  });

  let saveTimer;
  $('#noteTitle').addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(updateCurrentNote, 250); });
  $('#noteBody').addEventListener('input', () => { clearTimeout(saveTimer); saveTimer = setTimeout(updateCurrentNote, 250); });

  $('#pinBtn').addEventListener('click', togglePin);
  $('#deleteBtn').addEventListener('click', deleteCurrentNote);
  $('#shareBtn').addEventListener('click', shareCurrentNote);

  $('#backToListBtn').addEventListener('click', () => {
    $('#editor').classList.remove('editor-open');
    $('#sidebar').classList.remove('editor-open');
  });

  $('#trashList').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'restore') restoreNote(id);
    if (btn.dataset.action === 'wipe') wipeNote(id);
  });
}

// ---------- Arranque ----------
function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'violeta');
  loadNotes();
  initEvents();
  renderList();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
