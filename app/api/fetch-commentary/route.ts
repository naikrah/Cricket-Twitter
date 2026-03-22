import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface CommentaryEvent {
  id: string;
  over: string;
  text: string;
  type: string;
  score?: string;
}

function detectEventType(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('wicket') || t.includes('caught') || t.includes('bowled') || t.includes('lbw') || t.includes('run out') || t.includes('stumped') || t.includes('hits wicket')) return 'wicket';
  if (t.includes(' six') || t.includes('sixer') || t.includes('maximum') || t.includes('into the stands') || t.includes('over the rope')) return 'six';
  if (t.includes('four') || t.includes('boundary') || t.includes('races away') || t.includes('through the gap') || t.includes('beats the fielder')) return 'four';
  if (t.includes('fifty') || t.includes('half century') || (t.includes('50') && t.includes('milestone'))) return 'fifty';
  if (t.includes('hundred') || t.includes('century') || t.includes('ton!') || (t.includes('100') && t.includes('century'))) return 'hundred';
  if (t.includes('no ball') || t.includes('free hit')) return 'noball';
  return 'normal';
}

function cleanText(raw: string): string {
  return raw.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function dedupeEvents(events: CommentaryEvent[]): CommentaryEvent[] {
  const seen = new Set<string>();
  return events.filter(e => {
    if (!e.text || e.text.length < 15) return false;
    const key = e.text.slice(0, 50).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractScore(html: string): string {
  const m = html.match(/(\d{1,3}(?:\/\d{1,2})?)\s*\(\s*(\d{1,2}(?:\.\d)?\s*(?:Ovs?|ov)?)\s*\)/i);
  return m ? m[0].replace(/<[^>]+>/g, '').trim().slice(0, 30) : '';
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.google.com/',
};

// ── GOOGLE ──────────────────────────────────────────────────────────────────
async function scrapeGoogle(url: string): Promise<{ events: CommentaryEvent[], matchInfo: string, source: string }> {
  const res = await fetch(url, { headers: FETCH_HEADERS, cache: 'no-store' });
  const html = await res.text();
  const events: CommentaryEvent[] = [];
  const score = extractScore(html);

  // Title / match name
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  let matchInfo = titleMatch ? cleanText(titleMatch[1]).replace(' - Google Search', '').trim() : 'Google Cricket';

  // JSON-LD sport data
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      const desc = data.description || data.name || '';
      if (desc.length > 20) events.push({ id: `g-ld-${events.length}`, over: '', text: cleanText(desc), type: detectEventType(desc), score });
      if (data.name && data.name.toLowerCase().includes('vs')) matchInfo = cleanText(data.name);
    } catch {}
  }

  // Over ball commentary embedded by Google
  const overPat = /(\d{1,2}\.\d)\s*[:–-]\s*([A-Z][^<\n]{25,350})/g;
  let m2: RegExpExecArray | null;
  while ((m2 = overPat.exec(html)) !== null && events.length < 30) {
    const text = cleanText(m2[2]);
    if (text.length > 20) events.push({ id: `g-ov-${events.length}`, over: m2[1], text, type: detectEventType(text), score });
  }

  // Plain text sentences with cricket keywords
  const plain = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  const cricketKw = ['bowled', 'caught', 'six', 'four', 'wicket', 'lbw', 'run out', 'boundary', 'century', 'fifty'];
  for (const sentence of plain.split(/[.!?]+/).map(s => s.replace(/\s+/g, ' ').trim())) {
    if (sentence.length > 30 && sentence.length < 300 && cricketKw.some(k => sentence.toLowerCase().includes(k)) && events.length < 30) {
      events.push({ id: `g-txt-${events.length}`, over: '', text: sentence, type: detectEventType(sentence), score });
    }
  }

  events.forEach(e => { if (!e.score) e.score = score; });
  return { events: dedupeEvents(events).slice(0, 20), matchInfo, source: 'Google' };
}

// ── CRICBUZZ ─────────────────────────────────────────────────────────────────
function parseCricbuzz(html: string): { events: CommentaryEvent[], matchInfo: string } {
  const events: CommentaryEvent[] = [];
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const matchInfo = titleMatch ? cleanText(titleMatch[1]).replace(/[-|]?\s*Cricbuzz.*/i, '').trim() : 'Live Match';
  const score = extractScore(html);

  // JSON-LD
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      for (const line of (data.description || '').split('\n')) {
        const text = cleanText(line);
        if (text.length > 20) events.push({ id: `cb-ld-${events.length}`, over: '', text, type: detectEventType(text), score });
      }
    } catch {}
  }

  // Over patterns
  const overPat = /(\d{1,2}\.\d)\s*[-–]\s*([^<\n]{25,400})/g;
  let m: RegExpExecArray | null;
  while ((m = overPat.exec(html)) !== null && events.length < 40) {
    const text = cleanText(m[2]);
    if (text.length > 20) events.push({ id: `cb-ov-${events.length}`, over: m[1], text, type: detectEventType(text), score });
  }

  // CSS class patterns
  for (const pat of [/class="[^"]*comm-text[^"]*"[^>]*>([^<]{20,400})</g, /class="[^"]*commentary[^"]*"[^>]*>([^<]{20,400})</g]) {
    let cm: RegExpExecArray | null;
    while ((cm = pat.exec(html)) !== null && events.length < 40) {
      const text = cleanText(cm[1]);
      if (text.length > 20) events.push({ id: `cb-cls-${events.length}`, over: '', text, type: detectEventType(text), score });
    }
  }

  return { events: dedupeEvents(events).slice(0, 20), matchInfo };
}

// ── ESPN ──────────────────────────────────────────────────────────────────────
function findESPNCommentary(obj: any, depth: number): any[] {
  if (depth > 10 || !obj || typeof obj !== 'object') return [];
  const results: any[] = [];
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === 'object' && (item.commentary || item.overText || (item.text && item.overNum !== undefined))) results.push(item);
      results.push(...findESPNCommentary(item, depth + 1));
    }
  } else {
    for (const key of Object.keys(obj)) {
      if (['commentaryList', 'commentary', 'ballCommentary', 'overCommentary'].includes(key) && Array.isArray(obj[key])) results.push(...obj[key]);
      else results.push(...findESPNCommentary(obj[key], depth + 1));
    }
  }
  return results;
}

function parseESPN(html: string): { events: CommentaryEvent[], matchInfo: string } {
  const events: CommentaryEvent[] = [];
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const matchInfo = titleMatch ? cleanText(titleMatch[1]).replace(/\s*[|–-]\s*ESPNcricinfo.*/i, '').trim() : 'Live Match';
  const score = extractScore(html);

  // __NEXT_DATA__
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextMatch) {
    try {
      const comms = findESPNCommentary(JSON.parse(nextMatch[1]), 0);
      for (const c of comms.slice(0, 20)) {
        const text = cleanText(c.text || c.commentary || c.overText || '');
        if (text.length > 20) events.push({ id: `espn-nd-${events.length}`, over: String(c.overNum || ''), text, type: detectEventType(text), score: c.score || score });
      }
    } catch {}
  }

  // Over regex
  const overPat = /(\d{1,2}\.\d)\s*[-–]\s*([^<\n]{25,400})/g;
  let m: RegExpExecArray | null;
  while ((m = overPat.exec(html)) !== null && events.length < 40) {
    const text = cleanText(m[2]);
    if (text.length > 20) events.push({ id: `espn-ov-${events.length}`, over: m[1], text, type: detectEventType(text), score });
  }

  return { events: dedupeEvents(events).slice(0, 20), matchInfo };
}

// ── Generic fallback ─────────────────────────────────────────────────────────
function parseGeneric(html: string): { events: CommentaryEvent[], matchInfo: string } {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const matchInfo = titleMatch ? cleanText(titleMatch[1]).slice(0, 80) : 'Live Match';
  const events: CommentaryEvent[] = [];
  const score = extractScore(html);
  const plain = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

  const overPat = /(\d{1,2}\.\d)\s*[-–:]\s*(.{30,300}?)(?=\d{1,2}\.\d|$)/gs;
  let m: RegExpExecArray | null;
  while ((m = overPat.exec(plain)) !== null && events.length < 20) {
    const text = cleanText(m[2]);
    if (text.length > 20) events.push({ id: `gen-${events.length}`, over: m[1], text, type: detectEventType(text), score });
  }
  return { events: dedupeEvents(events).slice(0, 15), matchInfo };
}

// ── Main router ───────────────────────────────────────────────────────────────
async function scrapeCommentary(url: string): Promise<{ events: CommentaryEvent[], matchInfo: string, source: string }> {
  const isGoogle = url.includes('google.com');
  const isCricbuzz = url.includes('cricbuzz.com');
  const isESPN = url.includes('espncricinfo.com');

  if (isGoogle) return scrapeGoogle(url);

  const res = await fetch(url, { headers: FETCH_HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} — check the URL and try again`);
  const html = await res.text();

  if (isCricbuzz) return { ...parseCricbuzz(html), source: 'Cricbuzz' };
  if (isESPN) return { ...parseESPN(html), source: 'ESPNcricinfo' };
  return { ...parseGeneric(html), source: 'Web' };
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') return NextResponse.json({ error: 'URL required' }, { status: 400 });
    const urlTrimmed = url.trim();
    if (!urlTrimmed.startsWith('http')) return NextResponse.json({ error: 'Please enter a valid URL starting with https://' }, { status: 400 });
    const data = await scrapeCommentary(urlTrimmed);
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[fetch-commentary] error:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch commentary' }, { status: 500 });
  }
}
