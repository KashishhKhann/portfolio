/* ============================================================
   as(k)ashish.ai — portfolio chat interface
   ------------------------------------------------------------
   Currently backed by a deterministic intent matcher (no network,
   no API key, works on static hosting).

   To swap in a real LLM later, set CHAT_CONFIG.endpoint to a
   serverless function URL. Everything else stays the same — the
   UI only ever talks to getAnswer().
   ============================================================ */

const CHAT_CONFIG = {
  endpoint: null,        // e.g. '/api/chat' → enables live LLM mode
  streamDelay: 16,       // ms per word while "typing"
  thinkDelay: [320, 620] // random pre-answer latency range (ms)
};

/* ---------- KNOWLEDGE BASE ----------
   Each intent has:
     strong   — distinctive terms; a hit here is near-decisive
     keywords — supporting terms; weaker, additive
   plus an answer, optional tags, links, and a tile to jump to.
   All matching is word-boundary aware, so "hi" won't fire on "him". */

const GREETINGS = new Set(['hi', 'hey', 'hello', 'yo', 'sup', 'howdy', 'hiya',
  'greetings', 'good', 'morning', 'evening', 'afternoon', 'there']);

const KB = [
  {
    id: 'greeting',
    greetingOnly: true,
    strong: [], keywords: [],
    answer: "Hey — I'm the chat layer on Kashish's portfolio. Ask me about her projects, stack, or background and I'll pull the relevant details and point you at the right section.",
    chips: ['What does she build?', 'Best project?', 'Is she available?']
  },
  {
    id: 'about',
    strong: ['who are you', 'who is he', 'who is kashish', 'tell me about yourself', 'background',
      'introduce', 'what do you do', 'what does he do', 'bio'],
    keywords: ['about', 'yourself', 'summary', 'overview', 'who'],
    answer: "Kashish Khan — NLP and LLM engineer based in Dublin, Ireland. MSc in Artificial Intelligence (Dublin Business School, 2026) on top of an MCA from Amity University.\n\nThe work is mostly retrieval systems: RAG pipelines, knowledge graphs, embedding search, and the FastAPI + Docker plumbing to run them in production. Won the Lette AI track at Give(A)Go 2026. Currently open to AI/ML engineering roles in Ireland.",
    target: 'about',
    targetLabel: 'About',
    chips: ['Show me the projects', 'What is her stack?', 'Education?']
  },
  {
    id: 'projects',
    strong: ['projects', 'what have you built', 'what has he built', 'case studies',
      'what do you build', 'what does he build', 'portfolio'],
    keywords: ['project', 'built', 'build', 'builds', 'things you made', 'show me'],
    answer: "Three main builds:\n\n1. GraphRAG Clinical Decision Support — MSc dissertation. Hybrid retrieval over 50,000+ MIMIC-IV clinical notes using BioClinicalBERT, FAISS and a Neo4j knowledge graph.\n\n2. Lette Inbox Copilot — hackathon winner. Deterministic email triage with optional LLM enrichment and graceful fallback.\n\n3. LLM Trace & Cost Studio — self-hosted LLM observability, a LangSmith-lite deployed to Azure Container Apps.\n\nAsk about any of them for the detail.",
    target: 'projects',
    targetLabel: 'Projects',
    chips: ['Tell me about GraphRAG', 'The hackathon one', 'LLM Trace Studio']
  },
  {
    id: 'rag',
    strong: ['graphrag', 'rag', 'dissertation', 'thesis', 'clinical', 'mimic', 'neo4j', 'faiss',
      'bioclinicalbert', 'bm25', 'icd', 'ner', 'best project', 'biggest project', 'main project',
      'star project', 'knowledge graph'],
    keywords: ['medical', 'healthcare', 'retrieval', 'embeddings', 'embedding', 'vector search',
      'reranking', 'hybrid search', 'chunking'],
    answer: "GraphRAG Clinical Decision Support — the MSc dissertation, and the deepest build here.\n\nFive-stage pipeline over 50,000+ MIMIC-IV clinical notes: section-aware chunking across 7 note types with type-specific token targets → BioClinicalBERT embeddings (768-dim, CLS pooling) → FAISS indexing → Neo4j knowledge graph → hybrid retrieval.\n\nRanking blends dense FAISS retrieval (85%), BM25 lexical reranking (25%), knowledge-graph concept overlap with IDF-style frequency penalties (15%), and inferred section bias — which is what catches exact drug names and ICD codes that dense models miss on their own.\n\nChild-span refinement re-segments parent chunks at query time and re-ranks by cosine similarity, giving sentence-level precision without extra storage. Within-admission scoping prevents cross-patient leakage.\n\nResults across 50 tasks / 107 cases: ~1.0 hit@5, 89.7% section hit@k, 0.77 BERTScore F1.",
    tags: ['BioClinicalBERT', 'FAISS', 'Neo4j', 'MongoDB', 'LangChain', 'Docker', 'spaCy', 'BM25'],
    target: 'projects',
    targetLabel: 'the full breakdown',
    chips: ['Why a knowledge graph?', 'Other projects?', 'What is her stack?']
  },
  {
    id: 'kg',
    strong: ['why knowledge graph', 'why a knowledge graph', 'why a graph', 'why neo4j', 'why kg',
      'graph vs vector', 'why not just vector', 'cypher'],
    keywords: [],
    answer: "Because pure vector search flattens structure. Clinical notes have relationships — this admission, this patient, this diagnosis code, this medication — and cosine similarity throws all of that away.\n\nThe Neo4j layer stores NER-extracted entities as concept nodes enriched with ICD-10/ICD-9 codes. At retrieval time, concept overlap between the query and a candidate chunk becomes a scoring signal, with IDF-style penalties so common concepts don't dominate. It also gives clean scoping — within-admission constraints stop the retriever leaking across patients, which a flat index can't enforce.",
    tags: ['Neo4j', 'Cypher', 'spaCy', 'NetworkX'],
    target: 'projects',
    targetLabel: 'Projects'
  },
  {
    id: 'lette',
    strong: ['lette', 'hackathon', 'giveago', 'give a go', 'inbox copilot', 'inbox', 'email triage'],
    keywords: ['won', 'win', 'winner', 'award', 'copilot', 'competition', 'prize', 'triage'],
    answer: "Lette Inbox Copilot — won the Lette AI track at Give(A)Go 2026, and the Lette co-founder followed up directly about open engineering roles.\n\nFive-module pipeline: JSON email parsing → rule-based issue classification → deterministic urgency scoring → thread-level aggregation → a Streamlit UI with a ranked queue, filters, and per-thread timeline.\n\nThe design decision worth noting: triage is fully deterministic, so it works with zero API dependency. GPT-4o-mini only adds thread summaries and recommended actions on top, and falls back cleanly to the deterministic path if the LLM is unavailable. Judges liked that it degrades instead of breaking.",
    tags: ['Python', 'Streamlit', 'OpenAI API', 'GPT-4o-mini', 'Rule-based NLP'],
    links: [
      { label: 'GitHub', url: 'https://github.com/KashishhKhann/Lette' },
      { label: 'Announcement', url: 'https://www.linkedin.com/posts/kashish-k-258b72305_hackathon-dublintech-startups-activity-7437422061368696832-FAlO' }
    ],
    target: 'projects',
    targetLabel: 'Projects',
    chips: ['Tell me about GraphRAG', 'What is her stack?']
  },
  {
    id: 'llmtrace',
    strong: ['llm trace', 'trace', 'observability', 'langsmith', 'cost studio', 'tracing'],
    keywords: ['cost', 'monitoring', 'mlops', 'azure', 'container apps', 'deployment', 'deploy',
      'devops', 'infra', 'infrastructure', 'production', 'fastapi', 'docker'],
    answer: "LLM Trace & Cost Studio — a self-hosted LLM observability platform, essentially a LangSmith-lite.\n\nFastAPI backend, Streamlit dashboard, SQLite store, Docker Compose, deployed to Azure Container Apps. It captures per-request latency, token usage, and cost across LangChain pipelines, with deterministic chunk-ID mapping and embedding-drift mitigation so traces stay meaningful as indexes get rebuilt.\n\nBuilt it because debugging RAG without per-request cost and latency visibility is guesswork.",
    tags: ['FastAPI', 'Docker', 'Azure Container Apps', 'LangChain', 'SQLite', 'Streamlit'],
    target: 'projects',
    targetLabel: 'Projects'
  },
  {
    id: 'skills',
    strong: ['tech stack', 'stack', 'skills', 'skillset', 'technologies', 'toolkit',
      'what do you know', 'what does he know'],
    keywords: ['tools', 'languages', 'language', 'python', 'frameworks', 'libraries', 'pytorch',
      'tensorflow', 'langchain', 'sql', 'competencies'],
    answer: "Python is the primary language, with Julia, SQL, Bash and JavaScript alongside it.\n\nLLM/GenAI: LangChain, LlamaIndex, OpenAI API, HuggingFace, RAG pipelines, LoRA/PEFT.\nNLP: BERT, BioClinicalBERT, spaCy, NLTK, Sentence Transformers.\nML/DL: PyTorch, Scikit-learn, TensorFlow, Flux.jl, reinforcement learning.\nVector & graph: FAISS, ChromaDB, Neo4j (Cypher), NetworkX.\nMLOps: Docker, FastAPI, Azure Container Apps, GCP, MLflow.\nDatabases: MongoDB, PostgreSQL, SQLite.",
    target: 'skills',
    targetLabel: 'Skills',
    chips: ['Show me the projects', 'Education?', 'How do I get in touch?']
  },
  {
    id: 'education',
    strong: ['education', 'degree', 'degrees', 'university', 'msc', 'masters', 'mca', 'college',
      'academic', 'qualifications', 'dublin business school', 'amity', 'where did he study',
      'where did you study', 'certifications'],
    keywords: ['studied', 'study', 'school', 'grades', 'course', 'modules', 'graduate'],
    answer: "Two master's degrees.\n\nMSc Artificial Intelligence — Dublin Business School, 2025–2026. Dissertation on GraphRAG for clinical decision support. Modules covered advanced NLP, deep reinforcement learning, cognitive & ethical AI, and cloud computing. Also built MiniBioClinicalBERT from scratch in Julia.\n\nMCA (Master of Computer Applications) — Amity University, India, 2022–2024. Advanced software engineering, data structures, algorithms and databases, with full-stack and data-driven projects in Python, Java and SQL.\n\nCertifications: Google Cloud Computing Foundations (2023), Workato Automation Pro I (2024).",
    target: 'education',
    targetLabel: 'Education',
    chips: ['What is her stack?', 'Show me the projects']
  },
  {
    id: 'transformer',
    strong: ['from scratch', 'built from scratch', 'transformer', 'minibioclinicalbert', 'julia', 'flux'],
    keywords: ['implement', 'attention'],
    answer: "MiniBioClinicalBERT — a transformer implemented from scratch in Julia during the MSc, rather than assembled from HuggingFace parts.\n\nWorth doing for one reason: once you've written the attention mechanism, positional encoding and training loop by hand, the failure modes of the models you use in production stop being mysterious. It's the reason the GraphRAG retriever tuning was a set of informed decisions rather than hyperparameter roulette.",
    tags: ['Julia', 'Flux.jl', 'Transformers'],
    target: 'education',
    targetLabel: 'Education'
  },
  {
    id: 'contact',
    strong: ['contact', 'get in touch', 'reach out', 'email', 'linkedin', 'github', 'recruiter',
      'interview'],
    keywords: ['reach', 'talk', 'connect', 'message', 'call', 'socials', 'hire', 'hiring'],
    answer: "Best route is email: kashishkhann100@gmail.com — that's checked daily.\n\nLinkedIn and GitHub are both linked below, and there's a Contact section at the bottom of the page with the same details.",
    links: [
      { label: 'Email', url: 'mailto:kashishkhann100@gmail.com' },
      { label: 'LinkedIn', url: 'https://linkedin.com/in/kashish-k-258b72305' },
      { label: 'GitHub', url: 'https://github.com/KashishhKhann' }
    ],
    target: 'contact',
    targetLabel: 'Contact',
    chips: ['Is she available?', 'Can I get the CV?']
  },
  {
    id: 'resume',
    strong: ['resume', 'cv', 'curriculum vitae', 'download'],
    keywords: ['pdf', 'curriculum'],
    answer: "The CV is a one-click download — link below, or the button in the hero section.",
    links: [{ label: 'Download Resume (PDF)', url: 'Resume.pdf', download: true }],
    target: 'about',
    targetLabel: 'the hero'
  },
  {
    id: 'availability',
    strong: ['available', 'availability', 'open to work', 'notice period', 'when can you start',
      'job', 'jobs', 'roles', 'opportunities', 'visa', 'sponsorship', 'work permit', 'looking for'],
    keywords: ['looking', 'seeking', 'freelance', 'full time', 'remote', 'hybrid', 'start'],
    answer: "Available immediately, and actively looking.\n\nTarget roles: AI/ML engineer, NLP/LLM engineer, and data analyst positions in Ireland. Open to on-site, hybrid and remote arrangements. Based in Dublin, so no relocation needed for Irish roles.",
    target: 'contact',
    targetLabel: 'Contact',
    chips: ['How do I get in touch?', 'Can I get the CV?']
  },
  {
    id: 'location',
    strong: ['where are you based', 'where is he based', 'where do you live', 'location',
      'based in', 'relocate', 'relocation', 'timezone'],
    keywords: ['where', 'dublin', 'ireland', 'city', 'country', 'live', 'based'],
    answer: "Dublin, Ireland. Available for on-site, hybrid or remote work, and no relocation is needed for roles anywhere in Ireland.",
    target: 'contact',
    targetLabel: 'Contact'
  },
  {
    id: 'whyhire',
    strong: ['why hire', 'why should', 'strengths', 'stand out', 'differentiator', 'what makes you',
      'what makes him', 'elevator pitch', 'why you'],
    keywords: ['good at', 'pitch', 'sell', 'best at', 'unique'],
    answer: "Three honest reasons.\n\nShe ships systems, not notebooks. Every project here has a deployment story — Docker, FastAPI, Azure — not just a working cell.\n\nShe designs for failure. The hackathon winner runs entirely without an LLM if the API is down; the LLM only enriches. That instinct is rarer than it should be.\n\nShe's measured the work. Hit@5, section hit@k, BERTScore F1 across 107 evaluation cases — the retrieval claims come with numbers attached.",
    chips: ['Show me the projects', 'How do I get in touch?']
  },
  {
    id: 'meta',
    strong: ['are you real', 'real llm', 'are you an llm', 'you an llm', 'is this real',
      'how does this work', 'chatgpt', 'is this ai', 'are you ai', 'are you a bot', 'scripted',
      'actually ai', 'actually an llm', 'a bot', 'really ai',
      'how were you built', 'what model', 'who built this', 'how does this chat work'],
    keywords: ['gpt', 'fake', 'bot', 'prompt'],
    answer: "Fair question, and the honest answer: right now I'm a deterministic intent matcher, not a language model. Your message gets tokenised and scored against a keyword-weighted knowledge base, and the top-scoring intent returns a written answer. No API call, no key to leak, works on static hosting.\n\nThe interface was built with a clean swap point — one async function — so a real retrieval-augmented backend can drop in behind it without touching the UI. Which is, appropriately, the same architecture as the Lette project: deterministic core, LLM as enrichment.",
    chips: ['Show me the projects', 'What is her stack?']
  }
];

const FALLBACK = {
  answer: "I don't have a good answer for that one — my knowledge base only covers Kashish's work, stack and background.\n\nTry one of these, or email her directly at kashishkhann100@gmail.com.",
  chips: ['What does she build?', 'What is her stack?', 'Education?', 'How do I get in touch?']
};

const OPENING_CHIPS = [
  "What's her best project?",
  'What is her stack?',
  'Is she available for work?',
  'Why hire her?'
];

/* ---------- MATCHER ---------- */

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'of', 'to', 'in', 'on', 'for', 'and',
  'or', 'me', 'my', 'your', 'you', 'he', 'his', 'it', 'this', 'that', 'do', 'does', 'did', 'can',
  'could', 'would', 'i', 'we', 'they', 'them', 'with', 'please', 'tell', 'show', 'so', 'any']);

const SCORE = { strong: 5, phrase: 2, exact: 1.5, stem: 0.8 };
const THRESHOLD = 1.5;

/* Pronouns are folded to a single canonical form so the keyword lists
   below stay short — a visitor can type "her stack" or "his stack" and
   both route to the same intent. */
function normalise(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\bshe\b/g, 'he')
    .replace(/\b(her|hers)\b/g, 'his')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Word-boundary phrase test — prevents "hi" matching inside "him",
   or "rag" matching inside "graphrag". */
function hasPhrase(q, phrase) {
  return new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(q);
}

function scoreTerm(q, tokens, term, phraseWeight) {
  const k = normalise(term);
  if (!k) return 0;
  const words = k.split(' ');

  if (hasPhrase(q, k)) return phraseWeight * words.length;
  if (words.length > 1) return 0;

  for (const t of tokens) {
    if (t === k) return SCORE.exact;
    // tolerate simple plurals / stems, but only on words long enough to be distinctive
    if (t.length > 4 && k.length > 4 && (t.startsWith(k) || k.startsWith(t))) return SCORE.stem;
  }
  return 0;
}

function scoreIntent(query, intent) {
  const q = normalise(query);
  const tokens = q.split(' ').filter(t => t && !STOP.has(t));
  let score = 0;
  for (const term of (intent.strong || [])) score += scoreTerm(q, tokens, term, SCORE.strong);
  for (const term of (intent.keywords || [])) score += scoreTerm(q, tokens, term, SCORE.phrase);
  return score;
}

function matchLocal(query) {
  const q = normalise(query);
  const words = q.split(' ').filter(Boolean);

  // Greetings only count when the message is *just* a greeting
  if (words.length && words.length <= 3 && words.every(w => GREETINGS.has(w))) {
    return KB.find(i => i.id === 'greeting');
  }

  let best = null, bestScore = 0;
  for (const intent of KB) {
    if (intent.greetingOnly) continue;
    const s = scoreIntent(query, intent);
    if (s > bestScore) { bestScore = s; best = intent; }
  }
  if (!best || bestScore < THRESHOLD) return { ...FALLBACK, id: 'fallback' };
  return best;
}

/* ---------- ANSWER SEAM ----------
   The only place the UI touches the "backend". Swap the body of
   this function for a fetch() when CHAT_CONFIG.endpoint is set. */

async function getAnswer(query) {
  if (CHAT_CONFIG.endpoint) {
    try {
      const res = await fetch(CHAT_CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query })
      });
      if (!res.ok) throw new Error(res.status);
      return await res.json();   // { answer, tags?, links?, target?, chips? }
    } catch (err) {
      // graceful degradation — same pattern as the Lette pipeline
      console.warn('Live backend unavailable, falling back to local matcher:', err);
    }
  }
  const [lo, hi] = CHAT_CONFIG.thinkDelay;
  await new Promise(r => setTimeout(r, lo + Math.random() * (hi - lo)));
  return matchLocal(query);
}

/* ---------- UI ---------- */

const reduceMotion = !!(window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const log      = document.getElementById('chat-log');
const form     = document.getElementById('chat-form');
const input    = document.getElementById('chat-input');
const chipsBox = document.getElementById('chat-chips');
const sendBtn  = document.getElementById('chat-send');

let busy = false;

function scrollLog() {
  log.scrollTop = log.scrollHeight;
}

function addUserMessage(text) {
  const el = document.createElement('div');
  el.className = 'msg msg-user';
  el.innerHTML = `<div class="bubble"></div>`;
  el.querySelector('.bubble').textContent = text;
  log.appendChild(el);
  scrollLog();
}

function addTyping() {
  const el = document.createElement('div');
  el.className = 'msg msg-bot typing-msg';
  el.innerHTML = `<div class="bubble typing"><span></span><span></span><span></span></div>`;
  log.appendChild(el);
  scrollLog();
  return el;
}

function renderExtras(container, data) {
  const extras = document.createElement('div');
  extras.className = 'msg-extras';

  if (data.tags && data.tags.length) {
    const t = document.createElement('div');
    t.className = 'tags msg-tags';
    data.tags.forEach(tag => {
      const s = document.createElement('span');
      s.className = 'tag';
      s.textContent = tag;
      t.appendChild(s);
    });
    extras.appendChild(t);
  }

  if (data.links && data.links.length) {
    const row = document.createElement('div');
    row.className = 'msg-links';
    data.links.forEach(l => {
      const a = document.createElement('a');
      a.href = l.url;
      a.textContent = l.label;
      a.className = 'msg-link';
      if (l.download) a.setAttribute('download', '');
      else if (!l.url.startsWith('mailto:') && !l.url.endsWith('.pdf')) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      row.appendChild(a);
    });
    extras.appendChild(row);
  }

  if (data.target) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jump-btn';
    btn.innerHTML = `<span>Jump to ${data.targetLabel || data.target}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`;
    btn.addEventListener('click', () => jumpTo(data.target));
    extras.appendChild(btn);
  }

  if (extras.children.length) {
    container.appendChild(extras);
    requestAnimationFrame(() => extras.classList.add('show'));
  }
}

function renderChips(list) {
  chipsBox.innerHTML = '';
  if (!list || !list.length) return;
  list.forEach(text => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = text;
    b.addEventListener('click', () => { if (!busy) send(text); });
    chipsBox.appendChild(b);
  });
}

function streamAnswer(node, text) {
  return new Promise(resolve => {
    const paras = text.split('\n\n');
    const bubble = node.querySelector('.bubble');

    if (reduceMotion) {
      paras.forEach(p => {
        const el = document.createElement('p');
        el.textContent = p;
        bubble.appendChild(el);
      });
      scrollLog();
      return resolve();
    }

    let pi = 0;
    function nextPara() {
      if (pi >= paras.length) return resolve();
      const el = document.createElement('p');
      bubble.appendChild(el);
      const words = paras[pi].split(' ');
      let wi = 0;
      const timer = setInterval(() => {
        el.textContent += (wi === 0 ? '' : ' ') + words[wi];
        wi++;
        scrollLog();
        if (wi >= words.length) {
          clearInterval(timer);
          pi++;
          setTimeout(nextPara, 90);
        }
      }, CHAT_CONFIG.streamDelay);
    }
    nextPara();
  });
}

async function send(text) {
  const query = text.trim();
  if (!query || busy) return;

  busy = true;
  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;
  chipsBox.innerHTML = '';

  addUserMessage(query);
  if (window.pulseNetwork) window.pulseNetwork();

  const typingEl = addTyping();
  const data = await getAnswer(query);
  typingEl.remove();

  const botEl = document.createElement('div');
  botEl.className = 'msg msg-bot';
  botEl.innerHTML = `<div class="bubble"></div>`;
  log.appendChild(botEl);

  await streamAnswer(botEl, data.answer);
  renderExtras(botEl.querySelector('.bubble'), data);
  renderChips(data.chips && data.chips.length ? data.chips : OPENING_CHIPS);
  scrollLog();

  busy = false;
  input.disabled = false;
  sendBtn.disabled = false;
  input.focus({ preventScroll: true });
}

/* ---------- JUMP TO TILE ---------- */

function jumpTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const tile = el.closest('.tile') || el;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  tile.classList.remove('tile-flash');
  void tile.offsetWidth;           // restart the animation
  tile.classList.add('tile-flash');
  setTimeout(() => tile.classList.remove('tile-flash'), 2000);
}

/* ---------- NEURAL NETWORK HEADER GRAPHIC ----------
   Layered net that idles quietly and fires a forward activation
   wave whenever a message is sent. The graphic is tied to the
   interaction rather than being ambient decoration.            */

(function neuralStrip() {
  const cv = document.getElementById('nn-canvas');
  if (!cv) return;
  const c = cv.getContext('2d');

  // Kept shallow vertically — the strip is only ~40px tall
  const LAYERS = [2, 4, 4, 3, 2];
  let nodes = [], edges = [], W = 0, H = 0, dpr = 1;

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = cv.getBoundingClientRect();
    W = rect.width; H = rect.height;
    cv.width = W * dpr; cv.height = H * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    nodes = [];
    const padX = 18, padY = 8;
    LAYERS.forEach((count, li) => {
      const x = padX + (W - padX * 2) * (li / (LAYERS.length - 1));
      for (let n = 0; n < count; n++) {
        const y = count === 1
          ? H / 2
          : padY + (H - padY * 2) * (n / (count - 1));
        nodes.push({ x, y, layer: li, act: 0, phase: Math.random() * Math.PI * 2 });
      }
    });

    edges = [];
    for (let li = 0; li < LAYERS.length - 1; li++) {
      const from = nodes.filter(n => n.layer === li);
      const to = nodes.filter(n => n.layer === li + 1);
      from.forEach(a => to.forEach(b => {
        // thin the graph so it reads as a network, not a mesh
        if (Math.random() < 0.72) edges.push({ a, b, act: 0 });
      }));
    }
  }

  let wave = -1;   // -1 = idle; otherwise current activation front position
  window.pulseNetwork = function () {
    if (reduceMotion) return;
    wave = -0.6;
  };

  function frame(t) {
    c.clearRect(0, 0, W, H);
    const time = t / 1000;

    if (wave >= -0.6) {
      wave += 0.022;
      if (wave > LAYERS.length + 0.6) wave = -1;
    }

    // edges
    edges.forEach(e => {
      const target = wave >= -0.6
        ? Math.max(0, 1 - Math.abs(wave - (e.a.layer + 0.5)) * 1.6)
        : 0;
      e.act += (target - e.act) * 0.18;
      const base = 0.055;
      const alpha = base + e.act * 0.5;
      c.beginPath();
      c.moveTo(e.a.x, e.a.y);
      c.lineTo(e.b.x, e.b.y);
      c.strokeStyle = `rgba(168,85,247,${alpha})`;
      c.lineWidth = 0.6 + e.act * 1.1;
      c.stroke();
    });

    // nodes
    nodes.forEach(n => {
      const target = wave >= -0.6
        ? Math.max(0, 1 - Math.abs(wave - n.layer) * 1.5)
        : 0;
      n.act += (target - n.act) * 0.2;
      const idle = reduceMotion ? 0.5 : (Math.sin(time * 1.1 + n.phase) * 0.5 + 0.5);
      const r = 1.5 + idle * 0.45 + n.act * 1.6;

      if (n.act > 0.02) {
        const g = c.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4.5);
        g.addColorStop(0, `rgba(236,72,153,${0.4 * n.act})`);
        g.addColorStop(1, 'rgba(236,72,153,0)');
        c.beginPath();
        c.arc(n.x, n.y, r * 4.5, 0, Math.PI * 2);
        c.fillStyle = g;
        c.fill();
      }

      c.beginPath();
      c.arc(n.x, n.y, r, 0, Math.PI * 2);
      const mix = n.act;
      c.fillStyle = mix > 0.02
        ? `rgba(${Math.round(168 + 68 * mix)},${Math.round(85 - 13 * mix)},${Math.round(247 - 94 * mix)},${0.45 + 0.55 * mix})`
        : `rgba(168,85,247,${0.28 + idle * 0.22})`;
      c.fill();
    });

    requestAnimationFrame(frame);
  }

  build();
  window.addEventListener('resize', build);
  requestAnimationFrame(frame);
})();

/* ---------- BOOT ---------- */

if (form) {
  form.addEventListener('submit', e => {
    e.preventDefault();
    send(input.value);
  });

  renderChips(OPENING_CHIPS);

  // Opening message, streamed once the tile scrolls into view
  const greet = {
    answer: "Hi — ask me anything about Kashish's work and I'll answer from her actual project history, then point you at the right part of the page.",
    chips: OPENING_CHIPS
  };

  const boot = () => {
    const el = document.createElement('div');
    el.className = 'msg msg-bot';
    el.innerHTML = `<div class="bubble"></div>`;
    log.appendChild(el);
    if (window.pulseNetwork) window.pulseNetwork();
    streamAnswer(el, greet.answer);
  };

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => {
      if (en.isIntersecting) { boot(); obs.disconnect(); }
    });
  }, { threshold: 0.25 });
  io.observe(document.getElementById('chat'));
}
