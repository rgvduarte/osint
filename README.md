# 🔎 Inspector Xinxers

Uma web app estática para o GitHub Pages: tiras uma selfie e o Inspector Xinxers mostra todas as fotos da galeria em que apareces.

## Como funciona

```
 GitHub Actions (uma vez por galeria)                  Browser do convidado
 ─────────────────────────────────────                 ─────────────────────────────
 galeria ──► indexer/build-index.mjs ──► data/index-arc.json ──► app.js compara a selfie
   (login com password,   (deteta todas as caras,               com cada cara do índice
    scroll até ao fim)     512 números por cara)                e mostra as fotos
```

- **O índice é calculado offline.** A app nunca percorre a galeria em direto: seria lento, e o browser bloqueia a leitura de imagens de outro domínio.
- **A selfie não sai do telemóvel.** O modelo ([face-api](https://github.com/vladmandic/face-api)) corre no browser. Só são descarregados o índice (`data/index-arc.json`) e os modelos.
- As fotos são mostradas a partir dos URLs originais da galeria ou, se a galeria as proteger com login, a partir de miniaturas guardadas em `data/thumbs/` (ver abaixo).

## Configuração (uma vez)

1. **Secrets:** em *Settings → Secrets and variables → Actions → New repository secret*, cria:
   - `GALLERY_URL`: o link completo da galeria (com o `?code=…`)
   - `GALLERY_PASSWORD`: a senha de acesso à galeria
2. **Indexar:** em *Actions → Indexar galeria → Run workflow*.
   - Da primeira vez, experimenta com `limit = 20` e confirma no log que encontrou fotos e caras.
   - Se o log disser **“⚠ As imagens não abrem sem sessão”**, corre de novo com **thumbs** ligado.
   - Se não encontrar fotos, descarrega o artefacto **debug** do run: tem capturas de ecrã e o HTML da página, o que chega para ajustar o scraper.
3. **Publicar:** em *Settings → Pages*, escolhe *Deploy from a branch* → `main` / `(root)`.
   O site fica em `https://<utilizador>.github.io/<repo>/`.

Quando a galeria mudar, basta correr o workflow outra vez. Só as fotos novas são processadas.

## Outras fontes de fotos

O indexador também corre localmente (`cd indexer && npm install`):

```bash
# a partir de uma pasta com as fotos (p.ex. o ZIP da galeria) + URL público onde estão alojadas
PHOTOS_DIR=~/fotos PHOTO_BASE_URL=https://exemplo.com/fotos THUMBS=1 node build-index.mjs

# a partir de uma lista de URLs de imagens, um por linha
URLS_FILE=urls.txt node build-index.mjs

# diretamente da galeria
GALLERY_URL='https://…' GALLERY_PASSWORD='…' node build-index.mjs
```

Todas as opções estão documentadas no topo de `indexer/build-index.mjs`. Se o formato do índice mudar, `node repack.mjs` converte o `data/index-arc.json` existente sem voltar a indexar.

## Como decide quem és

- **Reconhecimento ArcFace** (InsightFace `w600k_mbf`, 512 dimensões), a correr no telemóvel com ONNX Runtime Web. O face-api só deteta as caras e os 68 pontos. Com 5 desses pontos, a cara é alinhada ao molde 112×112 do ArcFace (`arcface.js`, o mesmo código no indexador e na app). O descritor é a média da cara com a sua versão espelhada.
- Medido no índice real (1.788 fotos, 8.750 caras): entre caras de pessoas diferentes **na mesma foto** (familiares incluídos), só ~1% ficam a distância < 1,05; com o modelo antigo (dlib) eram 2–6% nos limiares usados. As caras de 24 pessoas que não estavam no casamento ficam todas a ≥ 1,10 de qualquer cara da galeria.
- **Sementes + expansão pela média:** as caras a < 1,05 da selfie são sementes. A pesquisa repete-se com a média da selfie e das melhores sementes, que é a cara tal como aparece nas fotos do casamento, e isso apanha fotos de lado e em movimento. O noivo passa de ~250 para ~495 fotos, a noiva de ~245 para ~500, e nenhuma cara é trocada entre os dois.
- **Calibração por pessoa:** algumas caras caem num "hub", uma zona onde muita gente se parece. Uma pessoa só aparece uma vez em cada foto, por isso a app conta as fotos em que "tu" aparecerias duas vezes e aperta o limiar até esses conflitos ficarem ≤ 5%. Em média ficam em 1,2%, contra 15% sem calibração, sem perder recall nos restantes. O que fica de fora vai para "Talvez também sejas tu" (as 60 mais parecidas).
- As caras pequenas (< 60px) têm um limiar 0,10 mais apertado, e a média só usa caras ≥ 80px.
- Juntar 2–3 selfies com ângulos diferentes ajuda.

## Descarregar as provas

O botão **Vai, vai, Xinxers-zip!** junta num .zip todas as fotos encontradas (versão de 2000px, ~0,8 MB cada), numeradas do mais certo para o menos certo, com um `LEIA-ME.txt` do inspector sobre os noivos. O zip é montado no próprio telemóvel ([fflate](https://github.com/101arrowz/fflate)); o CDN da galeria permite pedidos de outros sites (CORS `*`).

## Menu "Dossiês"

"Sobre o casamento" (relatório final do processo n.º 0506/2026) e dossiês-piada: direitos do convidado, livro de reclamações, apoio técnico, achados e perdidos, termos e condições, PROCURADO e modo ressaca. O conteúdo está em `dossies.js`: foi escrito por quatro "escritores" com ângulos diferentes, escolhido por um júri e verificado contra factos inventados. Só usa factos reais (números do índice, fotos dadas pelo inspector).

## Easter eggs

Enquanto não são descobertos, chamam a atenção à vez: o chapéu abana (com a nota "toca 3×!"), o carimbo carimba e o rastilho da autodestruição faísca. O telemóvel lembra-se dos que já foram descobertos (`localStorage`); com "reduzir movimento" ligado no sistema não há animações.

- O inspector espreita no visor enquanto analisa (de madrugada, e de vez em quando, ainda em recuperação).
- 3 toques no chapéu: cartaz de PROCURADO. 6 toques (ou escrever "xinxers" no teclado): o chapéu levanta voo.
- Carimbo CONFIDENCIAL (ou escrever "copo"): relatório de ocorrência.
- Se for o **noivo** a tirar a selfie: cadastro com a foto dele mascarado. O noivo é reconhecido por 40 caras de referência tiradas da galeria (`data/noivo.json`, gerado com `GROOM=2 node indexer/people.mjs`; o workflow **Analisar pessoas** confirma quem é quem pelo género/idade e por quem aparece junto com quem).
- A mensagem da missão autodestrói-se. Sem provas: o inspector mostra como passou a festa. Mais de 250 fotos: "Celebridade!". Selfie do próprio inspector: não se pode investigar a si próprio.

## Jogos

Por baixo da Xinxers-câmara há dois minijogos, cada um com o seu leaderboard. Os textos foram escritos por três humoristas, escolhidos por um editor e verificados contra factos inventados. Os regulamentos aparecem também no menu Dossiês.

- **Voa, Ricardo, Voa!** (`jogo.js`, textos em `jogo-textos.js`). Tipo Flappy Bird: a cara do noivo, de chapéu de hélice, a fugir de garrafas-paródia (Jaque Daniels, Dom Pérignão, Zé Corvo…). Os power-ups são do casamento: aliança (5 s invencível), copo-d'água (câmara lenta), fatia de bolo (+5), ramo da noiva (pontos a dobrar) e flash do inspector (limpa as garrafas). Quem ficar no topo ganha uma garrafa de queijo.
- **A repescagem** (`toques.js`, textos em `toques-textos.js`). Em miúdo, o Ricardo foi a um casting para gravar um anúncio com o Cristiano Ronaldo e não foi selecionado. Aqui tenta outra vez, a dar toques na bola num campo "desmanchado, cheio de pedras" e de bosta, como no [vídeo](https://www.youtube.com/watch?v=gXk6PRzooq0). Toca-se na bola do lado contrário àquele para onde se quer que ela vá. No campo aparecem:
  - o olheiro, que põe os toques a valer a dobrar;
  - as chuteiras, que deixam a bola maior;
  - uma vaca que atravessa o campo, deixa bosta e, se a bola lhe cair em cima, a faz ressaltar;
  - um pombo, que desvia a bola;
  - vento, a partir dos 20 toques.

  No fim de cada take, o júri do casting dá o veredicto: é sempre "não selecionado".

**Leaderboards partilhados.** Enquanto `FIREBASE_DB` (no topo de `placar.js`) estiver vazio, cada telemóvel só vê os seus resultados. Para um leaderboard de todos os convidados:

1. Em [console.firebase.google.com](https://console.firebase.google.com): *Criar projeto* (o Analytics pode ficar desligado) → *Build → Realtime Database → Criar base de dados* (localização: Bélgica, `europe-west1`) → *Começar no modo bloqueado*.
2. No separador *Regras*, cola isto e publica:
   ```json
   {
     "rules": {
       "$jogo": {
         ".read": "$jogo === 'voo' || $jogo === 'toques'",
         ".indexOn": ["score"],
         "$id": {
           ".write": "($jogo === 'voo' || $jogo === 'toques') && !data.exists()",
           ".validate": "newData.hasChildren(['name', 'score', 't']) && newData.child('name').isString() && newData.child('name').val().length > 0 && newData.child('name').val().length <= 20 && newData.child('score').isNumber() && newData.child('score').val() >= 0 && newData.child('score').val() <= 5000 && newData.child('t').val() == now"
         }
       }
     }
   }
   ```
   Qualquer pessoa pode ler os dois leaderboards (`voo` e `toques`) e acrescentar resultados; ninguém pode alterar nem apagar os que já lá estão.
3. Copia o URL da base de dados (algo como `https://xinxers-default-rtdb.europe-west1.firebasedatabase.app`) para `FIREBASE_DB` em `placar.js`.

O leaderboard é à base da confiança: quem souber usar o `curl` consegue inventar um resultado. Antes de entregar o prémio, confirma o vencedor na consola do Firebase (*Realtime Database → Dados*), onde podes também apagar batotas.

## Privacidade: lê isto antes de publicar

- `data/index-arc.json` contém **descritores biométricos** de todas as pessoas da galeria e fica público no GitHub Pages. No RGPD, isto são dados de categoria especial (art. 9.º). Para um evento privado, convém pelo menos avisar os convidados, ou pôr o repositório/Pages com acesso restrito.
- Com **thumbs** ligado, as miniaturas ficam públicas, contornando a password da galeria.
- As passwords ficam só nos secrets do GitHub; nunca no código.
