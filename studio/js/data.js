import { supabase } from './supabase.js';
import { createPendingQueue, createPendingStore } from './lib/pending.js';

let email = null;
const queues = new Map();
const stores = new Map();
function storeFor(owner) {
  if (!stores.has(owner)) stores.set(owner, createPendingStore({
    readText: () => localStorage.getItem(`studio.pending.${owner}`),
    writeText: (text) => localStorage.setItem(`studio.pending.${owner}`, text),
  }));
  return stores.get(owner);
}
const readPending = () => storeFor(email).read();
function queueFor(owner) {
  if (!queues.has(owner)) queues.set(owner, createPendingQueue({
    ...storeFor(owner),
    async send(row) {
      if (navigator.onLine === false || await currentEmail() !== owner) return false;
      const { error } = await supabase.from('events').insert(row);
      if (error && ['42501', '23514', '23503', '22P02'].includes(error.code)) {
        // A confirmed post may invalidate an offline choice. Preserve the rejected
        // action separately, notify the member, and let later valid actions sync.
        const rejectedKey = `studio.rejected.${owner}`;
        try {
          const rejected = JSON.parse(localStorage.getItem(rejectedKey) || '[]');
          localStorage.setItem(rejectedKey, JSON.stringify([...rejected, { ...row, rejected_at: new Date().toISOString(), code: error.code }].slice(-100)));
        } catch { /* The UI still reports rejection if storage is unavailable. */ }
        window.dispatchEvent(new CustomEvent('studio:rejected', { detail: { type: row.type } }));
        return true;
      }
      if (error && error.code !== '23505') return false;
      if (row.type === 'chose_account' || row.type === 'creative_link') {
        await ensureLink({ ct: row.payload.ct, account_id: row.account_id, card_id: row.card_id,
          kind: row.type === 'creative_link' ? 'creative' : 'card' });
      }
      return true;
    },
  }));
  return queues.get(owner);
}

function must({ data, error }) {
  if (error) throw error;
  return data;
}

export async function currentEmail() {
  const { data } = await supabase.auth.getSession();
  email = data.session?.user?.email?.toLowerCase() ?? null;
  return email;
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export const signOut = () => supabase.auth.signOut();

export async function loadTeam() {
  const [members, accounts, settings] = await Promise.all([
    supabase.from('members').select('id,name,email,is_demo,is_fixture').order('name'),
    supabase.from('accounts').select('id,handle,member_id,kind').order('handle'),
    supabase.from('account_settings_current').select('account_id,r2_template,account_code,created_at'),
  ]);
  return { members: must(members), accounts: must(accounts), settings: must(settings) };
}

export async function currentWeekId(today) {
  const rows = must(await supabase.from('weeks').select('id').lte('id', today).order('id', { ascending: false }).limit(1));
  return rows[0]?.id ?? null;
}

// PostgREST limits each response. Read every page so charts do not silently lose history.
async function allRows(query) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const page = must(await query().range(offset, offset + 999));
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

export async function loadWeeksFor(memberId) {
  const rows = await allRows(() => supabase.from('assignments').select('week_id').eq('member_id', memberId).order('week_id', { ascending: false }).order('id'));
  return [...new Set(rows.map((a) => a.week_id))];
}

export async function loadPosts(assignmentIds) {
  if (!assignmentIds.length) return [];
  return allRows(() => supabase.from('posts').select('*').in('assignment_id', assignmentIds).order('id'));
}

export async function loadQuestions(memberId) {
  return allRows(() => supabase.from('questions').select('*,assignment:assignments(card_id)').eq('member_id', memberId).order('created_at').order('id'));
}

export async function loadAnswerQuestions(ids) {
  return ids.length ? allRows(() => supabase.from('questions').select('*').in('id', ids).order('id')) : [];
}

export async function loadAnalytics() {
  const tables = { posts: 'posts', observations: 'observations', installs: 'install_observations',
    versions: 'post_versions', cards: 'cards', runs: 'collection_runs', keywords: 'card_keywords' };
  return Object.fromEntries(await Promise.all(Object.entries(tables).map(async ([key, table]) =>
    [key, await allRows(() => supabase.from(table).select('*').order(table === 'card_keywords' ? 'card_id' : 'id'))])));
}

const ASSIGNMENT = 'id,week_id,member_id,suggested_order,card:cards(*)';

export async function loadAssignments(weekId, memberId) {
  return must(await supabase.from('assignments').select(ASSIGNMENT).eq('week_id', weekId).eq('member_id', memberId).order('suggested_order'));
}

export async function loadAssignment(id) {
  const rows = must(await supabase.from('assignments').select(ASSIGNMENT).eq('id', id).limit(1));
  return rows[0] ?? null;
}

export async function loadEvents(assignmentIds) {
  const rows = assignmentIds.length
    ? await allRows(() => supabase.from('events').select('id,client_id,at,member_id,type,assignment_id,card_id,account_id,payload').in('assignment_id', assignmentIds).order('id'))
    : [];
  const seen = new Set(rows.map((r) => r.client_id));
  const pending = readPending()
    .filter((p) => !seen.has(p.client_id) && assignmentIds.includes(p.assignment_id))
    .map((p) => ({ ...p, id: Number.MAX_SAFE_INTEGER }));
  return [...rows, ...pending];
}

export async function loadAnswers(memberIds, limit = 200) {
  if (!memberIds.length) return [];
  return must(await supabase.from('events')
    .select('id,client_id,at,type,payload,member:members(name),card:cards(op),account:accounts(handle)')
    .in('type', ['answered', 'edited', 'skipped', 'flagged'])
    .in('member_id', memberIds)
    .order('id', { ascending: false })
    .limit(limit));
}

// Keep actions in storage before sending, with an in-memory fallback if storage is blocked.
// client_id is unique in the database, so a retry cannot create a duplicate.
export async function recordEvent({ type, assignment_id = null, card_id = null, account_id = null, payload = {} }) {
  if (!email) throw new Error('Chưa đăng nhập được.');
  const row = { client_id: crypto.randomUUID(), at: new Date().toISOString(), type, assignment_id, card_id, account_id, payload };
  queueFor(email).add(row);
  void flushPending();
  return { ...row, id: Number.MAX_SAFE_INTEGER };
}

export async function flushPending() {
  return email ? queueFor(email).flush() : 0;
}

export async function ensureLink({ ct, account_id, card_id = null, kind }) {
  const { error } = await supabase.from('links').insert({ ct, account_id, card_id, kind });
  if (error && error.code !== '23505') throw error;
}

export async function saveSettings({ account_id, r2_template, account_code }) {
  must(await supabase.from('account_settings').insert({ account_id, r2_template, account_code }));
}

// Members may change only their own name and their own accounts' handles (migration member_self_edit).
async function updateOwn(table, id, values) {
  const rows = must(await supabase.from(table).update(values).eq('id', id).select('id'));
  if (!rows.length) throw Object.assign(new Error('not yours'), { code: '42501' });
}
export const saveMemberName = (id, name) => updateOwn('members', id, { name });
export const saveHandle = (id, handle) => updateOwn('accounts', id, { handle });
