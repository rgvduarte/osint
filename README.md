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

Todas as opções estão documentadas no topo de `indexer/build-index.mjs`.

## Afinar resultados

- O cursor **Mais fotos ↔ Mais certeza** controla a distância máxima entre caras (0,40–0,65; por defeito 0,52).
- Juntar 2–3 selfies com ângulos diferentes melhora bastante os resultados. Cada foto conta pela selfie que lhe estiver mais próxima.
- Caras muito pequenas (menos de 36 px), de perfil ou tapadas podem escapar. Numa foto de grupo grande, o indexador também analisa cada quadrante para apanhar caras pequenas.

## Privacidade: lê isto antes de publicar

- `data/faces.json` contém **descritores biométricos** de todas as pessoas da galeria e fica público no GitHub Pages. No RGPD, isto são dados de categoria especial (art. 9.º). Para um evento privado, convém pelo menos avisar os convidados, ou pôr o repositório/Pages com acesso restrito.
- Com **thumbs** ligado, as miniaturas ficam públicas, contornando a password da galeria.
- As passwords ficam só nos secrets do GitHub; nunca no código.
