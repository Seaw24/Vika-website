import { supabase } from './supabase.js';
import { createPendingQueue, createPendingStore } from './lib/pending.js';

let email = null;
const queues = new Map();
const stores = new Map();
const readCache = new Map();
function cached(key, ttl, read) {
  const hit = readCache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = Promise.resolve().then(read);
  readCache.set(key, { value, until: Date.now() + ttl });
  value.catch(() => { if (readCache.get(key)?.value === value) readCache.delete(key); });
  return value;
}
export function clearReadCache() { readCache.clear(); }
const idsKey = (ids) => [...new Set(ids)].sort().join(',');
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
      // The link row exists before its code can bring an install: on a posted tap or a copied Bình luận 2 (and the older choice).
      if (row.payload?.ct && (['chose_account', 'creative_link', 'posted'].includes(row.type) || (row.type === 'copied' && row.payload.part === 'r2'))) {
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
  const next = data.session?.user?.email?.toLowerCase() ?? null;
  if (next !== email) clearReadCache();
  email = next;
  return email;
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export const signOut = () => supabase.auth.signOut();

const ACCOUNT = 'id,handle,member_id,kind,active,created_at';

export async function loadTeam() {
  const [members, accounts, settings] = await Promise.all([
    supabase.from('members').select('id,name,email,is_demo,is_fixture,tiktok').order('name'),
    supabase.from('accounts').select(ACCOUNT).order('handle'),
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
  return cached(`weeks:${memberId}`, 30000, async () => {
    const rows = await allRows(() => supabase.from('assignments').select('week_id').eq('member_id', memberId).order('week_id', { ascending: false }).order('id'));
    return [...new Set(rows.map((a) => a.week_id))];
  });
}

export async function loadPosts(assignmentIds) {
  if (!assignmentIds.length) return [];
  return cached(`posts:${idsKey(assignmentIds)}`, 15000,
    () => allRows(() => supabase.from('posts').select('*').in('assignment_id', assignmentIds).order('id')));
}

// The newest reading of each post, for the Hôm nay ledger.
export async function loadLatestObservations(postIds) {
  if (!postIds.length) return new Map();
  return cached(`observations:${idsKey(postIds)}`, 30000, async () => {
    const rows = await allRows(() => supabase.from('observations').select('post_id,captured_at,views,likes,replies,other_replies,reposts')
      .in('post_id', postIds).order('captured_at', { ascending: false }).order('id', { ascending: false }));
    const latest = new Map();
    for (const r of rows) if (!latest.has(r.post_id)) latest.set(r.post_id, r);
    return latest;
  });
}

export async function loadQuestions(memberId) {
  return cached(`questions:${memberId}`, 30000,
    () => allRows(() => supabase.from('questions').select('*,assignment:assignments(card_id)').eq('member_id', memberId).order('created_at').order('id')));
}

export async function loadAnswerQuestions(ids) {
  return ids.length ? allRows(() => supabase.from('questions').select('*').in('id', ids).order('id')) : [];
}

export async function loadAnalytics() {
  return cached('analytics', 60000, async () => {
    const tables = { posts: 'posts', observations: 'observations', installs: 'install_observations',
      versions: 'post_versions', cards: 'cards', runs: 'collection_runs', keywords: 'card_keywords' };
    return Object.fromEntries(await Promise.all(Object.entries(tables).map(async ([key, table]) =>
      [key, await allRows(() => supabase.from(table).select('*').order(table === 'card_keywords' ? 'card_id' : 'id'))])));
  });
}

const ASSIGNMENT = 'id,week_id,member_id,suggested_order,card:cards(*)';

export async function loadAssignments(weekId, memberId) {
  return cached(`assignments:${weekId}:${memberId}`, 30000,
    async () => must(await supabase.from('assignments').select(ASSIGNMENT).eq('week_id', weekId).eq('member_id', memberId).order('suggested_order')));
}

export async function loadAssignment(id) {
  const rows = must(await supabase.from('assignments').select(ASSIGNMENT).eq('id', id).limit(1));
  return rows[0] ?? null;
}

export async function loadEvents(assignmentIds) {
  const rows = assignmentIds.length ? await cached(`events:${idsKey(assignmentIds)}`, 15000,
    () => allRows(() => supabase.from('events').select('id,client_id,at,member_id,type,assignment_id,card_id,account_id,payload').in('assignment_id', assignmentIds).order('id'))) : [];
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
  clearReadCache();
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
// Members add their own accounts and retire them; an account is never deleted (migration member_add_account).
export const setAccountActive = (id, active) => updateOwn('accounts', id, { active });
export async function addAccount({ member_id, handle, kind }) {
  return must(await supabase.from('accounts').insert({ member_id, handle, kind }).select(ACCOUNT))[0];
}

/* ---------- The feedback chat (docs/plans/2026-10-12-feedback-chat.md) ---------- */

// Her edits and answers of the last weeks, from any card week, for the Kể lý do sửa list on Hôm nay.
export async function loadMyFeedback(memberId, sinceIso) {
  return cached(`feedback:${memberId}:${sinceIso.slice(0, 10)}`, 15000, async () => {
    const rows = await allRows(() => supabase.from('events').select('id,client_id,at,member_id,type,assignment_id,card_id,account_id,payload')
      .eq('member_id', memberId).in('type', ['edited', 'answered', 'question_dismissed']).gte('at', sinceIso).order('id'));
    const seen = new Set(rows.map((r) => r.client_id));
    const pending = readPending().filter((p) => !seen.has(p.client_id) && ['edited', 'answered', 'question_dismissed'].includes(p.type))
      .map((p) => ({ ...p, member_id: memberId, id: Number.MAX_SAFE_INTEGER }));
    return [...rows, ...pending];
  });
}

export async function loadCardsBrief(ids) {
  return ids.length ? must(await supabase.from('cards').select('id,op,r1,point_vi').in('id', [...new Set(ids)])) : [];
}

// One bot turn. Returns { reply, model }, or throws so the sheet can fall back to the reason form.
// The thrown message carries the function's own error and detail, which the fallback shows.
export async function askFeedbackChat(body) {
  const { data, error } = await supabase.functions.invoke('feedback-chat', { body });
  if (error) {
    let message = error.message;
    try {
      const j = await error.context?.json();
      if (j?.error) message = [j.error, j.detail].filter(Boolean).join(': ');
    } catch { /* the body was not JSON */ }
    throw new Error(message);
  }
  return data;
}

/* ---------- The owner's team view (every member already reads every row under RLS) ---------- */

// Everything that places a post on a day, across all card weeks: members post a card week's
// cards before and after its Monday, so the page groups by the day posted, not by card week.
// Edits, answers and the daily read's questions feed each member's reason ratio.
export async function loadTeamActivity() {
  return cached('teamActivity', 30000, async () => {
    const [assignments, events, posts, questions] = await Promise.all([
      allRows(() => supabase.from('assignments').select(ASSIGNMENT).order('id')),
      allRows(() => supabase.from('events').select('id,client_id,at,member_id,type,assignment_id,card_id,account_id,payload')
        .in('type', ['chose_account', 'undo_choice', 'choice_expired', 'skipped', 'posted', 'posted_undo', 'edited', 'answered', 'question_dismissed']).order('id')),
      allRows(() => supabase.from('posts').select('*').order('id')),
      allRows(() => supabase.from('questions').select('id,member_id,assignment_id,part,created_at').order('id')),
    ]);
    return { assignments, events, posts, questions };
  });
}

// The newest captured OP of each post, for posts that have no card text.
export async function loadLatestOps(postIds) {
  if (!postIds.length) return new Map();
  return cached(`ops:${idsKey(postIds)}`, 30000, async () => {
    const rows = await allRows(() => supabase.from('post_versions').select('post_id,op,captured_at,id')
      .in('post_id', postIds).order('captured_at', { ascending: false }).order('id', { ascending: false }));
    const latest = new Map();
    for (const r of rows) if (!latest.has(r.post_id)) latest.set(r.post_id, r.op);
    return latest;
  });
}

/* ---------- TikTok (Nam, 2026-10-09): only members with members.tiktok on read these rows and files ---------- */

export async function loadTikTok() {
  return cached('tiktok', 30000, async () => must(await supabase.from('tiktok_videos').select('*').order('created_at').order('slug')));
}

// Signed links to the private bucket, kept until a minute before they expire, so a return to the tab
// reuses them and the browser cache serves the posters again.
const signed = new Map();
export async function signedTikTokUrls(paths, ttl = 3600) {
  const missing = [...new Set(paths.filter(Boolean))].filter((p) => !(signed.get(p)?.until > Date.now() + 60000));
  if (missing.length) {
    const data = must(await supabase.storage.from('tiktok').createSignedUrls(missing, ttl));
    for (const d of data) if (d.signedUrl) signed.set(d.path, { url: d.signedUrl, until: Date.now() + ttl * 1000 });
  }
  return new Map(paths.filter((p) => signed.has(p)).map((p) => [p, signed.get(p).url]));
}

// Only the posted and skipped columns are hers to change (migrations tiktok_queue, tiktok_skip). Posting or
// skipping filters on a waiting row, so when two members tap at once only the first one lands; the other gets
// null back. `mine` names the column that must hold her id to take her own mark back.
export async function updateTikTok(id, patch, { waiting = false, mine = null, by = 'posted_by' } = {}) {
  let query = supabase.from('tiktok_videos').update(patch).eq('id', id);
  if (waiting) query = query.is('posted_by', null).is('skipped_by', null);
  if (mine) query = query.eq(by, mine);
  const rows = must(await query.select('*'));
  readCache.delete('tiktok');
  return rows[0] ?? null;
}
