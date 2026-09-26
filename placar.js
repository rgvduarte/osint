// Leaderboards dos jogos (Firebase Realtime Database, API REST, sem SDK).
// Preencher com o URL da base de dados (ex.: https://xinxers-default-rtdb.europe-west1.firebasedatabase.app)
// e usar as regras de README.md. Vazio = cada leaderboard fica guardado só neste telemóvel.
export const FIREBASE_DB = '';

const NAME_KEY = 'xinxers-voo-nome'; // o mesmo nome serve para todos os jogos

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
export const load = (k, d) => safe(() => JSON.parse(localStorage.getItem(k)) ?? d, d);
export const save = (k, v) => safe(() => localStorage.setItem(k, JSON.stringify(v)));
export const nomeGuardado = () => { const n = load(NAME_KEY, ''); return typeof n === 'string' ? n : ''; };
export const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// pedidos ao Firebase com prazo, para o botão não ficar preso em "A registar…" com rede fraca
function pedir(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

// Mostra o painel de fim. Durante meio segundo ignora toques: quem estava a jogar continua a
// tocar no ecrã e não deve carregar sem querer em "Outra vez!" ou no link do vídeo.
export function mostrarPainel(ui) {
  ui.over.style.pointerEvents = 'none';
  ui.over.hidden = false;
  ui.overTitle.focus({ preventScroll: true }); // leitores de ecrã: anuncia o resultado
  setTimeout(() => { ui.over.style.pointerEvents = ''; }, 600);
}

// path: nó na base de dados ('voo', 'toques'); localKey: chave do leaderboard local
export function criarPlacar({ path, localKey, board, note }) {
  async function submit(name, score) {
    save(NAME_KEY, name);
    if (FIREBASE_DB) {
      const res = await pedir(`${FIREBASE_DB}/${path}.json`, {
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
        // os melhores 500 registos (cada um tem poucos bytes); depois fica só o melhor de cada pessoa
        const res = await pedir(`${FIREBASE_DB}/${path}.json?orderBy="score"&limitToLast=500`);
        if (!res.ok) throw new Error(`leaderboard: ${res.status}`);
        rows = Object.values((await res.json()) || {});
        note.textContent = 'Leaderboard de todos os convidados.';
      } catch (e) {
        // mantém o quadro que já lá estava
        note.textContent = e.message.startsWith('leaderboard')
          ? `O cartório recusou o pedido (${e.message.replace('leaderboard: ', 'erro ')}).`
          : 'O cartório está fechado (sem rede). Tenta mais tarde.';
        return;
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
  // a tecla "Enviar" do teclado do telemóvel também regista
  name.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    name.blur();
    submit.click();
  });
  submit.addEventListener('click', async () => {
    const p = partida();
    const nome = name.value.trim().slice(0, 20);
    if (!nome) { name.focus(); name.placeholder = 'Primeiro, o teu nome'; return; }
    if (!p || p.submitted) return;
    p.submitted = true;
    submit.disabled = true;
    submit.textContent = 'A registar no cartório…';
    let ok = true;
    try { await placar.submit(nome, p.score); } catch { ok = false; }
    // se entretanto já começou outra partida, o botão já não é desta
    if (partida() === p) {
      if (ok) submit.textContent = 'Registado!';
      else {
        p.submitted = false;
        submit.disabled = false;
        submit.textContent = 'O cartório falhou. Tenta outra vez';
      }
    }
    placar.render();
  });
  return function reset(podeSubmeter) {
    if (!name.value.trim()) name.value = nomeGuardado(); // pode ter sido escrito no outro jogo
    submit.disabled = !podeSubmeter;
    submit.textContent = 'Entrar no leaderboard';
  };
}
