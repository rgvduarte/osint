# 🔎 Inspector Xinxers

Uma web app estática para o GitHub Pages: tiras uma selfie e o Inspector Xinxers mostra todas as fotos da galeria em que apareces.

## Como funciona

```
 GitHub Actions (uma vez por galeria)                  Browser do convidado
 ─────────────────────────────────────                 ─────────────────────────────
 galeria ──► indexer/build-index.mjs ──► data/faces.json ──► app.js compara a selfie
   (login com password,   (deteta todas as caras,           com cada cara do índice
    scroll até ao fim)     128 números por cara)            e mostra as fotos
```

- **O índice é calculado offline.** A app nunca percorre a galeria em direto: seria lento, e o browser bloqueia a leitura de imagens de outro domínio.
- **A selfie não sai do telemóvel.** O modelo ([face-api](https://github.com/vladmandic/face-api)) corre no browser. O único ficheiro descarregado é `data/faces.json`.
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

Todas as opções estão documentadas no topo de `indexer/build-index.mjs`. Se o formato do índice mudar, `node repack.mjs` converte o `data/faces.json` existente sem voltar a indexar.

## Como decide quem és

- Cada cara da galeria é um vetor de 128 números (face-api). Numa galeria de milhares de caras, a distância pura dá muitos falsos positivos: quem tem uma cara "genérica" fica perto de muita gente.
- Por isso a pontuação é **S-norm**: a distância entre a selfie e uma cara é comparada com o quanto ambas costumam estar perto de caras ao acaso. As estatísticas de cada cara da galeria vêm calculadas no índice (`indexer/format.mjs`).
- As caras acima do rigor do cursor são **sementes**. A partir delas, a app junta as outras fotos da mesma pessoa pela semelhança **entre fotos da galeria** (mesma câmara, mesmo dia, mesma luz), desde que a selfie também se pareça com elas.
- Não há cursor: a app usa sempre o limiar de **máximo de fotos** (S-norm 3,5), com as mais prováveis primeiro e marcadas "ÉS TU!" / "PROVÁVEL" / "TALVEZ".
- Medido no índice real (1.788 fotos, 8.750 caras): encontra ~97% das fotos de quem aparece em 5+ fotos; quem não estava no casamento vê em média 1 foto errada (máximo 14 em 24 caras testadas). Descer o limiar para 3,0 só daria 99% com o triplo das fotos erradas.
- Juntar 2–3 selfies com ângulos diferentes ajuda: cada cara conta pela selfie com que melhor pontua.

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

## Privacidade: lê isto antes de publicar

- `data/faces.json` contém **descritores biométricos** de todas as pessoas da galeria e fica público no GitHub Pages. No RGPD, isto são dados de categoria especial (art. 9.º). Para um evento privado, convém pelo menos avisar os convidados, ou pôr o repositório/Pages com acesso restrito.
- Com **thumbs** ligado, as miniaturas ficam públicas, contornando a password da galeria.
- As passwords ficam só nos secrets do GitHub; nunca no código.
