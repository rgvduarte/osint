// Leaderboards dos jogos (Firebase Realtime Database, API REST, sem SDK).
// Preencher com o URL da base de dados (ex.: https://xinxers-default-rtdb.europe-west1.firebasedatabase.app)
// e usar as regras de README.md. Vazio = cada leaderboard fica guardado só neste telemóvel.
export const FIREBASE_DB = '';

const NAME_KEY = 'xinxers-voo-nome'; // o mesmo nome serve para todos os jogos

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
export const load = (k, d) => safe(() => JSON.parse(localStorage.getItem(k)) ?? d, d);
export const save = (k, v) => safe(() => localStorage.setItem(k, JSON.stringify(v)));
export const nomeGuardado = () => { const n = load(NAME_KEY, ''); return typeof n === 'string' ? n : ''; };

// path: nó na base de dados ('voo', 'toques'); localKey: chave do leaderboard local
export function criarPlacar({ path, localKey, board, note }) {
  async function submit(name, score) {
    save(NAME_KEY, name);
    if (FIREBASE_DB) {
      const res = await fetch(`${FIREBASE_DB}/${path}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score, t: { '.sv': 'timestamp' } }),
      });
      if (!res.ok) throw new Error(`leaderboard: ${res.status}`);
      return;
    }
    const list = load(localKey, []);
    list.push({ name, score, t: Date.now() });
    list.sort((a, b) => b.score - a.score);
    save(localKey, list.slice(0, 60));
  }

  async function render() {
    let rows = [];
    if (FIREBASE_DB) {
      try {
        const res = await fetch(`${FIREBASE_DB}/${path}.json?orderBy="score"&limitToLast=60`);
        rows = Object.values((await res.json()) || {});
        note.textContent = 'Leaderboard de todos os convidados.';
      } catch {
        note.textContent = 'O cartório está fechado (sem rede). Tenta mais tarde.';
      }
    } else {
      rows = load(localKey, []);
      note.textContent = 'Por agora, o leaderboard está guardado só neste telemóvel.';
    }
    if (!Array.isArray(rows)) rows = [];
    // um lugar por pessoa (o melhor resultado); em empate, fica à frente quem lá chegou primeiro
    const bestOf = new Map();
    rows = rows.filter((r) => r && typeof r.name === 'string' && Number.isFinite(r.score));
    for (const r of rows.sort((a, b) => b.score - a.score || a.t - b.t)) {
      const k = r.name.trim().toLowerCase();
      if (!bestOf.has(k)) bestOf.set(k, r);
    }
    rows = [...bestOf.values()].slice(0, 10);
    const me = nomeGuardado().trim().toLowerCase();
    board.replaceChildren(...(rows.length ? rows : [{ name: 'Ainda ninguém. Sê o primeiro!', score: '' }]).map((r, i) => {
      const li = document.createElement('li');
      if (me && r.name.trim().toLowerCase() === me) li.className = 'me';
      const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
      li.innerHTML = '<span class="pos"></span><span class="who"></span><span class="pts"></span>';
      li.children[0].textContent = r.score === '' ? '' : medal;
      li.children[1].textContent = r.name;
      li.children[2].textContent = r.score;
      return li;
    }));
  }

  return { submit, render };
}

// Painel de fim de jogo: nome + "Entrar no leaderboard". partida() devolve { score, submitted }.
// Devolve reset(podeSubmeter), para chamar em cada fim de jogo.
export function ligarSubmissao({ name, submit }, placar, partida) {
  submit.addEventListener('click', async () => {
    const p = partida();
    const nome = name.value.trim().slice(0, 20);
    if (!nome) { name.focus(); name.placeholder = 'Primeiro, o teu nome'; return; }
    if (!p || p.submitted) return;
    p.submitted = true;
    submit.disabled = true;
    submit.textContent = 'A registar no cartório…';
    try {
      await placar.submit(nome, p.score);
      submit.textContent = 'Registado!';
    } catch {
      p.submitted = false;
      submit.disabled = false;
      submit.textContent = 'O cartório falhou. Tenta outra vez';
    }
    placar.render();
  });
  return function reset(podeSubmeter) {
    if (!name.value.trim()) name.value = nomeGuardado(); // pode ter sido escrito no outro jogo
    submit.disabled = !podeSubmeter;
    submit.textContent = 'Entrar no leaderboard';
  };
}
