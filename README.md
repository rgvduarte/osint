# Storm-Breaker — Front-end (GitHub Pages)

Site estático de **documentação** para a ferramenta de segurança ofensiva
[Storm-Breaker](https://github.com/ultrasecurity/Storm-Breaker), pronto a publicar no GitHub Pages.

> ⚠️ **Aviso:** esta página é apenas informativa/documental. **Não** inclui os templates de
> captura (câmara, microfone, localização) da ferramenta e não recolhe dados de visitantes.
> A ferramenta em si destina-se exclusivamente a **educação em segurança e testes de intrusão
> autorizados** — ver a secção "Uso ético" na página.

## Conteúdo

- `index.html` — página única (landing + documentação), responsiva, sem dependências externas.
- `assets/img/` — imagens de demonstração.
- `.github/workflows/pages.yml` — deploy automático para o GitHub Pages a partir da branch `main`.
- `.nojekyll` — desativa o processamento Jekyll.

## Publicar no GitHub Pages

Opção A — **GitHub Actions** (recomendado, já incluído):

1. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Faz merge para `main`. O workflow publica o site automaticamente.
3. O URL fica em `https://<utilizador>.github.io/<repositório>/`.

Opção B — **Deploy from a branch**:

1. **Settings → Pages → Source: Deploy from a branch**.
2. Branch: `main` · pasta: `/ (root)`.

## Desenvolvimento local

Basta abrir `index.html` no browser, ou:

```bash
python3 -m http.server 8000
# depois abre http://localhost:8000
```
