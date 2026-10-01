# Aave — v1.3 (app próprio)

App para acompanhar suas posições na Aave v3 (Ethereum, Arbitrum, Base, Polygon) no iPhone, com alertas no ntfy.

**Privacidade:** suas carteiras nunca vão para o repositório. Ficam só no iPhone e, para os alertas, num Secret criptografado do GitHub (ninguém consegue ler, nem em repo público). Os logs do Actions também não mostram carteira nem posição.

## 0. Apague o repositório antigo

A carteira salva na v1.1 continua no histórico de commits.
No repo antigo: **Settings → General → (fim da página) Delete this repository**.

## 1. Criar o repositório novo

1. No GitHub, crie um repositório **público** novo (ex.: `aave`).
2. Envie todo o conteúdo deste zip para a raiz dele, incluindo a pasta `.github`.
   No site do GitHub: **Add file → Upload files** e arraste os arquivos e pastas.
3. **Settings → Pages** → Source: **Deploy from a branch** → branch `main`, pasta `/ (root)` → Save.
4. Em ~1 min o app fica em `https://SEU-USUARIO.github.io/aave/`.

## 2. Token do GitHub

**GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token**
- Repository access: **Only select repositories** → só o repo do app
- Permissions → **Contents: Read and write** e **Secrets: Read and write**

## 3. Instalar no iPhone

1. Abra o link no Safari → **Compartilhar → Adicionar à Tela de Início**.
2. No primeiro acesso você cria o PIN, e o app oferece ativar o Face ID.
3. Em **Ajustes**: adicione as carteiras (com apelido), o repositório (`usuario/aave`) e o token → **Salvar**.
   O app guarda a carteira no iPhone e cria o Secret `AAVE_WALLETS` sozinho.

## 4. Alertas (ntfy)

No repo: **Settings → Secrets and variables → Actions → New repository secret**

- `NTFY_TOPIC` — o tópico do ntfy que você assina no iPhone
- `NTFY_TOKEN` — só se o tópico tiver senha (opcional)

Para testar: **Actions → Alertas Aave → Run workflow**.
Se o GitHub pedir, clique em **"I understand my workflows, go ahead and enable them"** na aba Actions.

## Observações

- O tópico do ntfy funciona como senha: quem souber o nome consegue ler as notificações. Use um nome difícil de adivinhar.
- O GitHub Actions costuma atrasar o cron de 5 min em horário de pico; conte com 5–15 min no modo HF baixo.
- Depois de salvar no app, o GitHub Pages leva ~1 min para servir os limites novos. O app usa a cópia local nesse meio tempo.
- Dados lidos direto dos contratos da Aave v3 via RPC público (publicnode). Para usar outro RPC, preencha `"rpc": { "arbitrum": "https://..." }` no `aave-config.json`.
