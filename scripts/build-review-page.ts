import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { questionHash } from '../content/hash';
import type { Question } from '../src/domain/types';

const KINDS = ['pick-picture', 'listen-pick', 'letter-tiles', 'pick-word', 'dialogue-choice'];
const KIND_OPTIONS = KINDS.map((k) => `<option value="${k}">${k}</option>`).join('');

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Escape everything, then let only bare <ruby>, <rt>, <rp> tags (and their closers) through. */
const escJa = (s: string): string => esc(s).replace(/&lt;(\/?)(ruby|rt|rp)&gt;/g, '<$1$2>');

/**
 * Where the emoji pictures live, relative to dist-review/index.html. Works when the page is opened from
 * dist-review/ inside the repository (nothing is copied).
 */
export const EMOJI_DIR = '../public/assets/emoji/';
export const emojiSrc = (imageId: string): string => `${EMOJI_DIR}${encodeURIComponent(imageId)}.svg`;
export const img = (imageId: string): string =>
  `<img class="pic" src="${esc(emojiSrc(imageId))}" alt="${esc(imageId)}" width="72" height="72">`;

const row = (label: string, value: string): string =>
  `<div class="row"><span class="lbl">${label}</span><span class="val">${value}</span></div>`;

function card(q: Question): string {
  const choices = (q.choices ?? [])
    .map((c) => {
      const right = c.id === q.answer;
      const text = [c.textEn, c.imageId ? `[image: ${c.imageId}]` : ''].filter(Boolean).join(' ');
      return `<li class="${right ? 'right' : ''}"><code>${esc(c.id)}</code> ${c.imageId ? `${img(c.imageId)} ` : ''}${esc(text)}${right ? ' <b>(answer / こたえ)</b>' : ''}</li>`;
    })
    .join('');
  const src = q.source;
  const srcExtra = [src.author ? `by ${esc(src.author)}` : '', src.url ? esc(src.url) : ''].filter(Boolean).join(' / ');
  return `<article class="card" data-id="${esc(q.id)}" data-kind="${esc(q.kind)}" data-grade="${esc(q.grade)}" data-hash="${esc(questionHash(q))}">
<header><span class="id">${esc(q.id)}</span> <span class="tag">${esc(q.kind)}</span> <span class="tag grade">Grade ${esc(q.grade)} / ${esc(q.grade)}きゅう</span> <span class="status" aria-live="polite"></span> <span class="ai-badge" hidden>AI-approved</span></header>
${q.promptEn ? `<p class="en">${esc(q.promptEn).replace(/\n/g, '<br>')}</p>` : ''}
${q.speakEn ? row('Spoken English / よみあげ', `<span class="en">${esc(q.speakEn)}</span>`) : ''}
${row('Japanese prompt / もんだい', `<span class="ja">${escJa(q.promptJa)}</span>`)}
${q.imageId ? row('Image / え', `${img(q.imageId)} ${esc(q.imageId)}`) : ''}
${choices ? `<ul class="choices">${choices}</ul>` : ''}
${row('Answer / こたえ', `<b>${esc(q.answer)}</b>`)}
${row('Source / ざいりょう', `${esc(src.name)} (${esc(src.license)})${srcExtra ? ` ${srcExtra}` : ''}`)}
<div class="btns"><button type="button" class="approve" data-act="approved">Approve / OK</button> <button type="button" class="reject" data-act="rejected">Reject / ダメ</button></div>
</article>`;
}

const CSS = `body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f6f4ee;color:#222}
header.top{background:#fff;border-bottom:1px solid #ccc;padding:12px 16px;z-index:1}
h1{font-size:20px;margin:0 0 4px}.card{background:#fff;margin:12px 16px;padding:12px 16px;border-radius:10px;border:2px solid #ddd}
.card.approved{border-color:#2e9d4f}.card.rejected{border-color:#c0392b;opacity:.75}
.id{font-weight:700}.tag{background:#eee;border-radius:6px;padding:1px 8px;margin-left:6px;font-size:13px}.grade{background:#ffe9a8}
.en{font-size:22px;margin:8px 0}.row{margin:4px 0}.lbl{display:inline-block;min-width:11em;color:#666;font-size:13px}
.choices{margin:6px 0;padding-left:20px}.choices .right{background:#d8f3dc;font-weight:600}
button{font-family:inherit;font-size:16px;padding:8px 16px;border-radius:8px;border:1px solid #888;background:#fff;cursor:pointer;margin-right:6px}
.approve{background:#d8f3dc}.reject{background:#fadbd8}.dl{background:#ffe9a8}.status{margin-left:8px;font-weight:700}
.pic{vertical-align:middle;background:#fafafa;border:1px solid #ddd;border-radius:8px;margin:2px 6px 2px 0}
.choices li{margin:4px 0}.card[hidden]{display:none}
.filters,.bulk{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0}
.filters label{font-size:14px;color:#444}select{font:inherit;font-size:16px;padding:8px 10px;min-height:44px;border-radius:8px;border:1px solid #888;background:#fff;margin-left:4px}
.bulk button{min-height:48px;font-size:17px;font-weight:700}.ai-badge{background:#d6e4ff;border:1px solid #6b8fd6;color:#1d3f8a;border-radius:6px;padding:1px 8px;font-size:13px;font-weight:700}
.ai-badge[hidden]{display:none}#shown{font-weight:700}
#count{margin-left:10px;font-weight:600}.note{color:#555;font-size:14px}.stale{color:#9a5b00}`;

/**
 * The page's own script (plain ES5, no template placeholders other than __KEY__). Decisions are
 * { id: { status, hash } }; `hash` fingerprints the question as shown, so a decision made on an older
 * version of a question (or loaded from an old file) is ignored instead of approving changed content.
 * They are kept in localStorage under a key derived from this page's list of question ids.
 */
export const REVIEW_JS = `(function(){
var KEY='__KEY__';
var cards=[].slice.call(document.querySelectorAll('.card'));
var hashes={};cards.forEach(function(c){hashes[c.getAttribute('data-id')]=c.getAttribute('data-hash');});
var d={};
function has(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
function valid(e){return !!e&&typeof e==='object'&&(e.status==='approved'||e.status==='rejected')&&typeof e.hash==='string'&&(e.by===undefined||e.by==='parent'||e.by==='ai');}
function entry(status,hash,by){var e={status:status,hash:hash};if(by==='ai')e.by='ai';return e;}
function merge(src){
  var r={added:0,ignored:0,bad:false};
  if(!src||typeof src!=='object'||Array.isArray(src)){r.bad=true;return r;}
  Object.keys(src).forEach(function(id){
    var e=src[id];
    if(!has(hashes,id)||!valid(e)||e.hash!==hashes[id]){r.ignored++;return;}
    d[id]=entry(e.status,e.hash,e.by);r.added++;
  });
  return r;
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(d));}catch(e){}}
function $(id){return document.getElementById(id);}
function state(c){var e=d[c.getAttribute('data-id')];return e?e.status:'undecided';}
function visible(c){
  var fs=$('f-status').value,fk=$('f-kind').value,fg=$('f-grade').value,e=d[c.getAttribute('data-id')];
  if(fk!=='all'&&c.getAttribute('data-kind')!==fk)return false;
  if(fg!=='all'&&c.getAttribute('data-grade')!==fg)return false;
  if(fs==='all')return true;
  if(fs==='ai')return !!e&&e.status==='approved'&&e.by==='ai';
  return state(c)===fs;
}
function paint(){
  var a=0,x=0,ai=0,n=0;
  cards.forEach(function(c){
    var e=d[c.getAttribute('data-id')];
    c.className='card'+(e?' '+e.status:'');
    c.querySelector('.status').textContent=e?(e.status==='approved'?'Approved':'Rejected'):'';
    c.querySelector('.ai-badge').hidden=!(e&&e.status==='approved'&&e.by==='ai');
    if(e){if(e.status==='approved'){a++;if(e.by==='ai')ai++;}else x++;}
    c.hidden=!visible(c);if(!c.hidden)n++;
  });
  $('count').textContent='approved '+a+' / rejected '+x+' / undecided '+(cards.length-a-x)+(ai?' (AI-approved '+ai+')':'');
  $('shown').textContent='Showing '+n+' of '+cards.length;
}
function note(t){$('msg').textContent=t;}
function describe(){
  var p=[];
  if($('f-kind').value!=='all')p.push('kind: '+$('f-kind').value);
  if($('f-grade').value!=='all')p.push('grade: '+$('f-grade').value);
  if($('f-status').value!=='all')p.push('status: '+$('f-status').value);
  return p.length?p.join(', '):'no filter';
}
function bulk(act){
  var list=cards.filter(function(c){return !c.hidden;});
  if(!list.length){note('Nothing is shown, so nothing was changed.');return;}
  var n=list.length,w=n+' shown question'+(n===1?'':'s')+' ('+describe()+')?';
  var q=act==='clear'?'Clear the decision of '+w:(act==='approved'?'Approve ':'Reject ')+w;
  if(!confirm(q))return;
  list.forEach(function(c){var id=c.getAttribute('data-id');
    if(act==='clear')delete d[id];else d[id]=entry(act,hashes[id]);});
  save();paint();
  note((act==='clear'?'Cleared ':act==='approved'?'Approved ':'Rejected ')+n+' question'+(n===1?'':'s')+'.');
}
try{var raw=localStorage.getItem(KEY);if(raw)merge(JSON.parse(raw));}catch(e){}
cards.forEach(function(c){c.querySelectorAll('button[data-act]').forEach(function(b){b.addEventListener('click',function(){
  var id=c.getAttribute('data-id');d[id]=entry(b.getAttribute('data-act'),hashes[id]);save();paint();});});});
['f-status','f-kind','f-grade'].forEach(function(id){$(id).addEventListener('change',paint);});
$('bulk-approve').addEventListener('click',function(){bulk('approved');});
$('bulk-reject').addEventListener('click',function(){bulk('rejected');});
$('bulk-clear').addEventListener('click',function(){bulk('clear');});
$('loadbtn').addEventListener('click',function(){$('load').click();});
$('load').addEventListener('change',function(ev){
  var f=ev.target.files&&ev.target.files[0];if(!f)return;
  var fr=new FileReader();
  fr.onload=function(){
    try{
      var r=merge(JSON.parse(String(fr.result)));
      if(r.bad){note('Not an approvals.json file.');return;}
      save();paint();note('Loaded '+r.added+' decision(s); ignored '+r.ignored+' (unknown id or question changed since).');
    }catch(e){note('Could not read that file.');}
    ev.target.value='';
  };
  fr.readAsText(f);});
$('dl').addEventListener('click',function(){
  var o={};Object.keys(d).sort().forEach(function(k){o[k]=d[k];});
  var blob=new Blob([JSON.stringify(o,null,2)+'\\n'],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='approvals.json';
  document.body.appendChild(a);a.click();document.body.removeChild(a);});
paint();})();`;

/** Storage key for a review page: derived from the ids it contains, so different review files never collide. */
export function storageKey(questions: Question[]): string {
  return `village-review.${createHash('sha256').update(questions.map((q) => q.id).join('\n')).digest('hex').slice(0, 12)}`;
}

export function renderReviewHtml(questions: Question[]): string {
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.id)) throw new Error(`Duplicate question id: ${q.id}`);
    seen.add(q.id);
  }
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Question review / もんだいチェック</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
<h1>Question review / もんだいチェック</h1>
<p>Check each question, then press Approve (OK) or Reject (ダメ). When done, download approvals.json. / ひとつずつ見て、OKかダメをおしてください。</p>
<button type="button" id="dl" class="dl">Download approvals.json</button>
<button type="button" id="loadbtn">Load approvals.json</button><input type="file" id="load" accept="application/json,.json" hidden>
<span id="count"></span> <span id="msg" class="note" role="status"></span>
<div class="filters">
<label>Status / じょうたい <select id="f-status"><option value="all">All</option><option value="undecided" selected>Undecided</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="ai">AI-approved</option></select></label>
<label>Kind / しゅるい <select id="f-kind"><option value="all">All</option>${KIND_OPTIONS}</select></label>
<label>Grade / きゅう <select id="f-grade"><option value="all">All</option><option value="5">5</option><option value="4">4</option></select></label>
<span id="shown" role="status"></span>
</div>
<div class="bulk">
<button type="button" id="bulk-approve" class="approve">Approve all shown</button>
<button type="button" id="bulk-reject" class="reject">Reject all shown</button>
<button type="button" id="bulk-clear">Clear all shown</button>
</div>
<p class="note">The three big buttons only change the questions currently shown by the filters above. Hidden questions are never touched.</p>
<p class="note">Your decisions are kept in this browser. If a question is edited later, its decision is dropped and you review it again.</p>
</header>
<main>
${questions.map(card).join('\n')}
</main>
<script>${REVIEW_JS.replace('__KEY__', storageKey(questions))}</script>
</body>
</html>
`;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const all: Question[] = [];
  for (const g of ['5', '4']) all.push(...(JSON.parse(readFileSync(resolve(root, `content/authored/${g}.json`), 'utf8')) as Question[]));
  mkdirSync(resolve(root, 'dist-review'), { recursive: true });
  writeFileSync(resolve(root, 'dist-review/index.html'), renderReviewHtml(all));
  console.log(`review page: ${all.length} questions -> dist-review/index.html`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
