// ============================================================================
// Mock של @supabase/supabase-js לבדיקות מקומיות של netlify/functions/documents.js
// בסיס נתונים בזיכרון + אכיפת unique על documents.file_hash (קוד 23505),
// בדיוק כמו האינדקס במיגרציה. אין שום חיבור לרשת או לייצור.
// ============================================================================

const state = globalThis.__MOCK_SUPA_STATE__ ||= {
  tables: { documents: [], document_sources: [] },
  storage: {}, // path → true (קבצים "שהועלו")
};

export function resetMockState() {
  state.tables.documents = [];
  state.tables.document_sources = [];
  state.storage = {};
}
globalThis.__MOCK_SUPA_RESET__ = resetMockState;

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.mode = 'select';
    this.payload = null;
    this.wantSingle = false;
    this.wantMaybe = false;
  }
  select() { if (this.mode === 'select') return this; this.returnRows = true; return this; }
  insert(rows) { this.mode = 'insert'; this.payload = rows; return this; }
  update(row) { this.mode = 'update'; this.payload = row; return this; }
  eq(col, val) { this.filters.push(r => r[col] === val); return this; }
  neq(col, val) { this.filters.push(r => r[col] !== val); return this; }
  gte(col, val) { this.filters.push(r => r[col] != null && r[col] >= val); return this; }
  lte(col, val) { this.filters.push(r => r[col] != null && r[col] <= val); return this; }
  in(col, arr) { this.filters.push(r => arr.includes(r[col])); return this; }
  is(col, val) { this.filters.push(r => (val === null ? r[col] == null : r[col] === val)); return this; }
  not(col, op, val) {
    if (op === 'is' && val === null) this.filters.push(r => r[col] != null);
    return this;
  }
  order(col, opts = {}) { this.orders.push({ col, asc: opts.ascending !== false }); return this; }
  maybeSingle() { this.wantMaybe = true; return this; }
  single() { this.wantSingle = true; return this; }

  _rows() {
    let rows = state.tables[this.table] || [];
    for (const f of this.filters) rows = rows.filter(f);
    for (const { col, asc } of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : av > bv ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    return rows;
  }

  _exec() {
    if (this.mode === 'insert') {
      const inserted = [];
      for (const row of this.payload) {
        // אכיפת unique index על documents.file_hash — כמו במיגרציה
        if (this.table === 'documents' && row.file_hash) {
          const dup = state.tables.documents.find(d => d.file_hash === row.file_hash);
          if (dup) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "ux_documents_file_hash"' } };
        }
        if (state.tables[this.table].some(r => r.id === row.id)) {
          return { data: null, error: { code: '23505', message: 'duplicate key (id)' } };
        }
        const full = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
        state.tables[this.table].push(full);
        inserted.push(full);
      }
      return this._shape(inserted);
    }
    if (this.mode === 'update') {
      const rows = this._rows();
      for (const r of rows) Object.assign(r, this.payload);
      return this._shape(rows);
    }
    return this._shape(this._rows().map(r => ({ ...r })));
  }

  _shape(rows) {
    if (this.wantSingle) {
      if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: `expected 1 row, got ${rows.length}` } };
      return { data: rows[0], error: null };
    }
    if (this.wantMaybe) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }

  then(resolve, reject) { return Promise.resolve(this._exec()).then(resolve, reject); }
}

export function createClient(_url, _key) {
  return {
    from: (table) => new Query(table),
    storage: {
      from: (_bucket) => ({
        createSignedUploadUrl: async (path) => {
          return { data: { signedUrl: `https://mock.local/upload/${encodeURIComponent(path)}?token=mock`, token: 'mock-token', path }, error: null };
        },
        createSignedUrl: async (path, _ttl) => {
          if (!state.storage[path]) return { data: null, error: { message: 'Object not found' } };
          return { data: { signedUrl: `https://mock.local/signed/${encodeURIComponent(path)}?token=mock` }, error: null };
        },
        remove: async (paths) => {
          for (const p of paths) delete state.storage[p];
          return { data: paths, error: null };
        },
      }),
    },
  };
}

/** סימולציית העלאה בפועל לכתובת חתומה (הצלחה/כישלון) */
export function mockUploadFile(path, ok = true) {
  if (!ok) return false;
  state.storage[path] = true;
  return true;
}
globalThis.__MOCK_SUPA_UPLOAD__ = mockUploadFile;
