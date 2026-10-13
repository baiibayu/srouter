<div align="center">

# 🚀 SRouter

### ローカルファーストのスマート AI ゲートウェイ & 無料 LLM ルーター

**レート制限（429）によるコーディング中断をゼロに。プロンプト圧縮と自動フォールバックで、約60社の無料 AI プロバイダーと 1,200 以上のエンドポイントを統合。**

**すべての AI コーディングツール（Claude Code、Cursor、Windsurf、Cline、Codex、Copilot、Aider、OpenCode など）を、単一の OpenAI 互換エンドポイントにシームレス接続。**

[![npm version](https://img.shields.io/npm/v/@baiibayu/srouter.svg?color=blue&logo=npm)](https://www.npmjs.com/package/@baiibayu/srouter)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.18.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](docs/en/install/01-install.md#docker-compose)
[![Desktop App](https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-blueviolet?logo=electron&logoColor=white)](desktop/)
[![i18n Locales](https://img.shields.io/badge/i18n-60%20Languages-orange)](client/src/i18n/locale-config.ts)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Sponsor](https://img.shields.io/badge/Sponsor-baiibayu-ea4aaa?logo=github-sponsors&logoColor=white)](#-開発者をサポート)

<p align="center">
  <a href="#-クイックスタート"><b>⚡ クイックスタート</b></a> •
  <a href="#-srouter-が選ばれる理由"><b>🤔 選ばれる理由</b></a> •
  <a href="#-アーキテクチャと動作の仕組み"><b>🔄 動作の仕組み</b></a> •
  <a href="#-主な機能"><b>✨ 主な機能</b></a> •
  <a href="#-ai-エージェント接続"><b>🤖 エージェント接続</b></a> •
  <a href="#-対応プロバイダー"><b>🔌 対応プロバイダー</b></a> •
  <a href="#-プロジェクト構造"><b>🏗️ プロジェクト構造</b></a> •
  <a href="docs/README.md"><b>📚 ドキュメント</b></a>
</p>

<p align="center">
  <b>言語 / Language:</b>
  <a href="README.md"><b>🇺🇸 English</b></a> •
  <a href="README.id.md"><b>🇮🇩 Bahasa Indonesia</b></a> •
  <a href="README.zh-cn.md"><b>🇨🇳 简体中文</b></a> •
  <a href="README.ja.md"><b>🇯🇵 日本語</b></a>
</p>

<p align="center">
  <a href="docs/en/install/01-install.md#docker-compose"><img src="repo-assets/badges/docker.svg" height="42" alt="Docker でセルフホスト"></a>
  <a href="desktop/"><img src="repo-assets/badges/windows.svg" height="42" alt="Windows デスクトップアプリ"></a>
  <a href="desktop/"><img src="repo-assets/badges/macos.svg" height="42" alt="macOS デスクトップアプリ"></a>
</p>

![SRouter ダッシュボード — リアルタイムルーティング、月間トークン予算、使用量統計](repo-assets/github-hero.png)

*ルーターは Ed25519 署名付きフィードから 1 日 2 回自動同期されます。手動の `git pull` を行うことなく、新しい無料モデル、クォータの更新、互換性パッチが自動適用されます。*

</div>

---

## 🤔 SRouter が選ばれる理由

AI コーディングツール（Claude Code、Cursor、Windsurf、Cline）での開発は非常に強力ですが、日常的に以下の問題に直面します：

| ❌ 開発現場の課題 | ✅ SRouter による解決策 |
| :--- | :--- |
| **有料サブスク枠の失効と無駄遣い：** 毎月の割り当てトークンが使い切れずに月末に消滅する。 | **トークン価値を最大化：** クォータ期限が近いものをインテリジェントに優先消費し、最適にプロバイダー間を巡回。 |
| **突然のレート制限（429）による作業停止：** 長いプロンプトや連続したツール呼び出しで、コーディング思考が中断される。 | **スマート3階層自動フォールバック：** サブスク $\to$ 格安モデル $\to$ 100% 無料・キー不要モデルへと瞬時に切り替え、ダウンタイムゼロを実現。 |
| **ツール出力によるトークンの無駄消費：** `git diff`、ログ、テスト結果、肥大化した JSON でコンテキスト長が瞬く間に枯渇する。 | **プロンプト圧縮 & トークンセーバー：** AST 構文解析とヒューリスティックフィルタでノイズを剪定し、**トークンを 20〜40% 削減**。 |
| **複数 SDK・API 形式の断片化：** 数十社のプロバイダーごとに異なる認証形式やエンドポイントを管理する負担。 | **単一の汎用 `/v1` ゲートウェイ：** 1つの OpenAI 互換エンドポイント（`http://localhost:20268/v1`）で、Anthropic Messages（`/v1/messages`）、Gemini（`/v1beta`）、Ollama エミュレーションに対応。 |
| **予告のない無料枠の仕様変更：** 各社が週単位でモデルの追加・廃止や制限変更をサイレント実施。 | **署名付きカタログの自動同期：** 約 1,200 以上のモデル情報をローカル SQLite へ自動更新。常に最新環境を維持。 |
| **API キー漏洩のプライバシーリスク：** 外部の未知のクラウドプロキシに生の API キーを送信するリスク。 | **100% ローカル AES-256-GCM 暗号化：** キーはローカルの SQLite 内に暗号化保存され、リクエストは端末から直接各公式プロバイダーへ送信されます。 |

---

## 🔄 アーキテクチャと動作の仕組み

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ご利用の AI コーディングツール & IDE                   │
│       (Claude Code, Cursor, Windsurf, Cline, Roo Code, Codex, Aider)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ http://localhost:20268/v1
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SRouter スマート AI ゲートウェイ                    │
│  • 複雑度ゲート（System One：簡易プロンプトは高速モデル、複雑な実装は深層思考）│
│  • プロンプト圧縮 & トークンセーバー（冗長なターミナル出力や JSON を圧縮）    │
│  • プロトコル相互変換（OpenAI ↔ Anthropic Messages ↔ Gemini ↔ Ollama）       │
│  • キー単位レート制限追跡（RPM / RPD / TPM を追跡し UTC 周期で自動リセット）│
│  • ローカル AES-256-GCM 暗号化ボールト & SQLite 永続化                       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
 ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
 │  第1階層: 高速 / サブスク│   │  第2階層: 大容量 / 格安  │   │ 第3階層: 100% 無料・免責 │
 │  • Google Gemini 2.5     │   │  • Mistral / Codestral   │   │  • Kilo Gateway (キー不要)│
 │  • Groq (Llama 3.3 70B)  │──►│  • Zhipu GLM-4 / 視覚    │──►│  • OpenCode Free(キー不要)│
 │  • Pollinations (無料) │   │  • Cloudflare Workers AI │   │  • OVH Endpoints (キー不要)│
 │  • OpenRouter / DeepSeek │   │  • Cohere / NVIDIA NIM   │   │  • LLM7 / AI Horde       │
 └──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

リクエストを受信すると、SRouter はモデルの稼働状態、残りレート制限、タスク複雑度を評価して最適なルートを選択します。プロバイダーから `429 Too Many Requests` や `5xx` エラーが返された場合、該当キーを一時クールダウンし、**フォールバックチェーン内の次の最適モデルへ即座にリトライ**します。

---

## ⚡ クイックスタート

お好みの起動方法を選択してください：

### 方法 1：グローバル CLI / NPX（最も手軽）

Node.js 20+ がインストールされている環境であれば、リポジトリの clone なしで即座に起動できます：

```bash
# npx で直接実行
npx @baiibayu/srouter

# またはグローバルインストール
npm install -g @baiibayu/srouter
srouter
```

自動的にブラウザでダッシュボード（`http://localhost:20268`）が開きます。

---

### 方法 2：Docker Compose（サーバー / 自宅ラボ推奨）

```bash
# 1. リポジトリをクローン
git clone https://github.com/baiibayu/srouter.git
cd srouter

# 2. 環境変数ファイルをコピーしてコンテナを起動
cp .env.example .env
docker compose up -d
```

- **ダッシュボード：** `http://localhost:20268`
- **OpenAI 互換エンドポイント：** `http://localhost:20268/v1`

---

### 方法 3：デスクトップアプリ（Windows & macOS）

システムトレイ常駐型の GUI アプリケーションをご希望の場合：

1. **[Releases リリースページ](https://github.com/baiibayu/srouter/releases/latest)** を開きます。
2. インストーラーをダウンロード：
   - **Windows:** `SRouter-Setup-x.x.x.exe`
   - **macOS:** `SRouter-x.x.x-arm64.dmg`（Apple Silicon）または `x64.dmg`（Intel）。
3. アプリを起動するとタスクトレイ / メニューバーに常駐し、クリックするとリアルタイム統計と統合 API キーが表示されます。

---

### 方法 4：ソースコードから開発実行

```bash
# 1. クローンして依存関係をインストール
git clone https://github.com/baiibayu/srouter.git
cd srouter
npm install

# 2. データベースマイグレーションの実行
npm run db:migration:up

# 3. 開発サーバーの起動（サーバー :20268 + UI :5173、HMR 対応）
npm run dev
```

---

## 🤖 AI コーディングツールの接続

SRouter には自動設定ジェネレーター（`setup-*`）が備わっており、稼働中のモデル一覧を自動認識して各ツール用の設定ファイルを生成します：

```bash
# Claude Code の自動設定
npx srouter setup-claude --url http://localhost:20268 --api-key <統合APIキー>
```

| ツール | 自動設定コマンド | 接続先 Base URL | プロトコル対応 |
| :--- | :--- | :--- | :--- |
| **Claude Code** | `npx srouter setup-claude` または `srouter launch` | `http://localhost:20268` | ネイティブ Anthropic `/v1/messages` 形式 |
| **Cursor / Windsurf** | `npx srouter setup-cursor`（または手動設定） | `http://localhost:20268/v1` | OpenAI Chat Completions 形式 |
| **Cline** | `npx srouter setup-cline` | `http://localhost:20268/v1` | OpenAI / Anthropic 形式 |
| **Roo Code / Kilo** | `npx srouter setup-roo` / `setup-kilo` | `http://localhost:20268/v1` | OpenAI Chat Completions 形式 |
| **Codex CLI** | `npx srouter setup-codex` または `srouter launch-codex` | `http://localhost:20268/v1` | ネイティブ `/v1/responses` 形式 |
| **Aider** | `npx srouter setup-aider` | `http://localhost:20268/v1` | OpenAI Chat Completions 形式 |
| **Continue.dev** | `npx srouter setup-continue` | `http://localhost:20268/v1` | チャット & ゴーストテキスト補完 |
| **OpenCode** | `npx srouter setup-opencode` | `http://localhost:20268/v1` | OpenAI Chat Completions 形式 |
| **Gemini CLI** | ネイティブ `/v1beta` | `http://localhost:20268` | ネイティブ `generateContent` 形式 |
| **Zed / JetBrains AI** | Ollama エミュレーション | `http://localhost:20268` | ネイティブ NDJSON Ollama 形式 |

<details>
<summary><b>設定スニペットの例（クリックして展開）</b></summary>

### Claude Code のセキュア起動（ディスクにキー保存なし）
```bash
# 子プロセスにのみ認証情報を一時注入
npx srouter launch
```

### Cursor / Windsurf の設定
```json
{
  "openai.baseUrl": "http://localhost:20268/v1",
  "openai.apiKey": "srouter-your-unified-key",
  "openai.model": "auto"
}
```

### Python OpenAI SDK からの利用
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:20268/v1",
    api_key="srouter-your-unified-key",
)

response = client.chat.completions.create(
    model="auto:smart",  # または "auto:fast", "auto", 特定のモデル名
    messages=[{"role": "user", "content": "TypeScript の Generics について簡潔に説明してください。"}],
)

print(response.choices[0].message.content)
print("ルーティング先:", response.headers.get("x-routed-via"))
```

</details>

---

## 🔌 対応プロバイダー

SRouter は **約60社のプロバイダー** と **1,200 以上のエンドポイント** を統合しています。

<div align="center">

<table>
<tr>
<td align="center" width="140"><img src="repo-assets/providers/google.png" width="40" alt="Google"><br/><b>Google Gemini</b></td>
<td align="center" width="140"><img src="repo-assets/providers/groq.png" width="40" alt="Groq"><br/><b>Groq Llama</b></td>
<td align="center" width="140"><img src="repo-assets/providers/pollinations.png" width="40" alt="Pollinations"><br/><b>Pollinations</b></td>
<td align="center" width="140"><img src="repo-assets/providers/mistral.png" width="40" alt="Mistral"><br/><b>Mistral AI</b></td>
<td align="center" width="140"><img src="repo-assets/providers/openrouter.png" width="40" alt="OpenRouter"><br/><b>OpenRouter</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/cloudflare.png" width="40" alt="Cloudflare"><br/><b>Cloudflare</b></td>
<td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="repo-assets/providers/cohere-dark.png"><img src="repo-assets/providers/cohere.png" width="40" alt="Cohere"></picture><br/><b>Cohere</b></td>
<td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="repo-assets/providers/zhipu-dark.png"><img src="repo-assets/providers/zhipu.png" width="40" alt="Zhipu AI"></picture><br/><b>Zhipu GLM</b></td>
<td align="center"><img src="repo-assets/providers/nvidia.png" width="40" alt="NVIDIA"><br/><b>NVIDIA NIM</b></td>
<td align="center"><img src="repo-assets/providers/huggingface.png" width="40" alt="HuggingFace"><br/><b>HuggingFace</b></td>
</tr>
<tr>
<td align="center"><img src="repo-assets/providers/aihorde.png" width="40" alt="AI Horde"><br/><b>AI Horde</b></td>
<td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="repo-assets/providers/kilo-dark.png"><img src="repo-assets/providers/kilo.png" width="40" alt="Kilo"></picture><br/><b>Kilo Gateway</b></td>
<td align="center"><img src="repo-assets/providers/llm7.png" width="40" alt="LLM7"><br/><b>LLM7</b></td>
<td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="repo-assets/providers/ollama-dark.png"><img src="repo-assets/providers/ollama.png" width="40" alt="Ollama"></picture><br/><b>Ollama Cloud</b></td>
<td align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="repo-assets/providers/ovh-dark.png"><img src="repo-assets/providers/ovh.png" width="40" alt="OVH"></picture><br/><b>OVH AI Endpoints</b></td>
</tr>
</table>

</div>

### 1. ⚡ 100% 無料・キー不要（登録不要・クレジットカード不要）
| プロバイダー | 利用可能モデル | 備考 |
| :--- | :--- | :--- |
| **Kilo Gateway** | Kilo Auto Free, Nemotron-3 Ultra Free | 匿名で即座に利用可能 |
| **OpenCode Free** | OpenCode Tier モデル群 | 内蔵の無料オープン推論プール |
| **OVH AI Endpoints** | Qwen3Guard, Stable Diffusion, Whisper TTS | 2 RPM 匿名無料枠 |
| **LLM7** | Codestral, Mistral-Nemo, Gemma 4, GPT-OSS | 充実した日次無料枠 |
| **AI Horde** | コミュニティ LLaMA, Qwen, Gemma, Mistral | コミュニティ分散型推論ネットワーク |

### 2. 🌐 充実した無料枠を持つ主要プロバイダー
- **Google AI Studio:** Gemini 2.5 Flash / Pro（非常に寛大な日次無料枠）
- **Groq:** Llama 3.3 70B & Mixtral（圧倒的な高速推論、30 RPM 無料枠）
- **Pollinations:** 無料テキスト+画像 (キー不要)
- **Mistral AI:** Codestral（高精度コーディングモデル）、Mistral Small
- **Cloudflare Workers AI:** 1 日あたり 10,000 neurons の無料枠
- **Cohere:** Command R / Command R+ トライアルクレジット
- **NVIDIA NIM:** 1,000 回のオープンフロンティアモデル無料 API コール

### 3. 🌏 各種リージョナルゲートウェイ
- **ModelScope（Alibaba Cloud）：** Qwen3.8、DeepSeek V4 Pro、GLM-5.2（日次 2,000 リクエスト無料）
- **Baidu Qianfan & Volcengine Ark：** DeepSeek や Doubao の無料枠
- **NaraRouter & Sea-Lion：** 東南アジア・多言語向け低遅延モデル

### 4. 🔌 ローカルモデル & カスタムゲートウェイ
**Ollama**、**LM Studio**、**vLLM**、**llama.cpp** でローカル実行しているモデルも、ダッシュボードの Keys 画面からワンクリックで追加できます。

---

## 🏗️ プロジェクト構造

SRouter はモジュール化されたクリーンな Monorepo 構成を採用しています：

```
srouter/
├── cli/                 ← CLI ツール & エージェント自動ジェネレーター (`srouter setup-*`)
├── client/              ← Web ダッシュボード (React + Vite + Tailwind + Lucide、60 言語対応)
├── desktop/             ← Electron デスクトップアプリ (macOS & Windows メニューバー常駐)
├── docker/              ← Dockerfile およびコンテナ実行構成
├── docs/                ← 包括的な多言語ドキュメントと API リファレンス
│   ├── en/              ← 英語公式ガイド
│   ├── id/              ← インドネシア語公式ガイド
│   ├── zh-cn/           ← 簡体字中国語ガイド
│   └── README.md        ← ドキュメントポータル入口
├── repo-assets/         ← ブランドアセット、アーキテクチャ図、UI スクリーンショット
├── scripts/             ← 環境構築、テスト、リリース自動化スクリプト
├── server/              ← ゲートウェイエンジン本体 (Node.js + TypeScript + SQLite)
│   ├── src/
│   │   ├── db/          ← SQLite データベース、マイグレーション、シードデータ
│   │   ├── providers/   ← 60社以上のプロバイダーアダプター & プロトコル実装
│   │   ├── routes/      ← OpenAI、Anthropic、Gemini、Ollama および管理 API
│   │   ├── services/    ← 多腕バンディット、クォータ監視、暗号化ボールト、圧縮
│   │   └── index.ts     ← ゲートウェイサーバーのエントリポイント
├── shared/              ← 共有 TypeScript 型定義およびカタログスキーマ
├── CONTRIBUTING.md      ← コントリビューターガイドと PR 規約
├── LICENSE              ← オープンソース MIT ライセンス
└── package.json         ← Monorepo ワークスペース定義
```

---

## ✨ 主な機能

- **マルチプロトコル自動相互変換：**
  - 完全な OpenAI サーフェス（`/v1/chat/completions`、`/v1/models`、`/v1/embeddings`、`/v1/images/*` 等）。
  - Claude Code をネイティブ動作させる Anthropic Messages API（`/v1/messages`）。
  - Google Gemini API（`/v1beta/models/*:generateContent`）。
  - Zed や JetBrains AI 向けのローカル Ollama エミュレーション。
- **プロンプト圧縮 & トークンセーバー：**
  - AST 構文解析と正規表現による非破壊フィルタで、肥大化したツール呼び出し結果（`git diff`、ターミナルログ、ファイル内容）を剪定。
  - 重複 JSON 構造を圧縮し、**トークン消費量を 20〜40% 削減**。
- **6つのインテリジェントルーティング戦略：**
  - `auto`: 応答速度、モデル性能、残りクォータを総合判定した最適解。
  - `auto:fast`: 超低遅延プロバイダー（Groq）を最優先。
  - `auto:smart`: 高性能な思考モデル（Gemini 2.5 Pro、Codestral）を優先。
  - `auto:cheap`: サブスク枠を温存し、軽量な無料モデルを活用。
  - `auto:<profile>`: ダッシュボードで自由に作成したカスタムチェーン。
- **マルチモデル協調合成（Fusion）：**
  - 仮想モデル `fusion` を呼び出すと、複数の無料モデルに並列で回答ドラフトを生成させ、審査モデルが最適な 1 つの回答に統合します。
- **複雑度ゲート（Complexity Gate / System One）：**
  - 簡易なプロンプトは高速モデルへ即時転送し、複数ステップを要する実装タスクは高知能モデルへ自動割り当て。
- **組み込み MCP サーバー（`/mcp`）：**
  - ChatGPT、Claude Desktop、MCP クライアントから SRouter を直接ツールとして呼び出し可能。
- **ローカル完結の暗号化セキュリティ：**
  - プロバイダーキーはローカル SQLite 内で **AES-256-GCM** 暗号化保存。
  - クライアント側には SRouter が発行する単一の統合キーのみを公開。
- **60 言語対応：**
  - ダッシュボードはブラウザ言語を自動検出し、アラビア語・ヘブライ語などの RTL レイアウトにも完全対応。

---

## 🛠️ 開発コマンド一覧

| コマンド | 説明 |
| :--- | :--- |
| `npm run dev` | サーバー（:20268）と UI（:5173）をホットリロード有効で起動 |
| `npm run dev:lan` | ローカルネットワーク（LAN）内の他端末からもアクセス可能に起動 |
| `npm run build` | サーバー、CLI、クライアントの本番ビルドを実行 |
| `npm test` | 全テストスイート（単体テスト、初期化テスト、フック）を実行 |
| `npm run lint` | TypeScript とコードスタイルの静的解析を実行 |
| `npm run db:migration:up` | 未適用の SQLite マイグレーションをすべて実行 |
| `npm run db:migration:down` | 直前のデータベースマイグレーションをロールバック |
| `npm run db:migration:create --name=<n>` | 新規マイグレーションファイルを生成 |
| `npm run desktop:dev` | Electron デスクトップアプリを開発モードで起動 |
| `npm run desktop:dist:win` | Windows 用インストーラー（`.exe`）をビルド |
| `npm run desktop:dist:mac:x64` | macOS Intel 用インストーラー（`.dmg`）をビルド |

---

## 🖼️ ダッシュボード画面プレビュー

<div align="center">

### 動的モデルフォールバック & リアルタイムスコアリング
![モデル管理](repo-assets/models.png)

### ローカル暗号化キーストア & クォータ監視
![キー管理](repo-assets/keys.png)

### マルチモーダル対応のインタラクティブ・プレイグラウンド
![プレイグラウンド](repo-assets/playground.png)

### リアルタイムのレイテンシ & トークン消費アナリティクス
![分析画面](repo-assets/analytics.png)

</div>

---

## ⚠️ トラブルシューティング（FAQ）

### 1. ポート 20268 がすでに使用されている
`.env` ファイルを変更するか、起動引数で指定してください：
```bash
srouter serve --port 20270
```

### 2. プロバイダーから 429 Too Many Requests が返される
SRouter はレート制限を受けたキーを自動的にクールダウンし、フォールバックチェーン内の次のモデルに即座にリクエストを転送します。ダッシュボードでキー不要の無料枠（Kilo や OpenCode Free）を有効にしておくことで、完全な停止を防止できます。

### 3. ダッシュボードのログインパスワードを忘れた
ログイン画面の **"Forgot password?"** をクリックしてください。ローカルファースト設計のため、1回限りの6桁リセットコードはサーバーのターミナルログに直接出力されます：
```bash
# Docker をご利用の場合:
docker compose logs -f srouter

# CLI またはデスクトップアプリの場合:
# ターミナル出力、または ~/.srouter/logs/srouter.log を確認してください
```

### 4. データベースと設定ファイルはどこに保存されますか？
- **グローバル CLI / ソース実行：** `~/.srouter/srouter.db`
- **Docker コンテナ：** `/app/server/data` にマウントされたボリューム
- **Windows デスクトップ：** `%APPDATA%\SRouter\srouter.db`
- **macOS デスクトップ：** `~/Library/Application Support/SRouter/srouter.db`

---

## 🤝 コントリビューション

コミュニティからの貢献を心より歓迎します！新しい無料プロバイダーのアダプター追加、プロンプト圧縮の最適化、UI 翻訳の改善など：

1. **[コントリビューターガイド (CONTRIBUTING.md)](CONTRIBUTING.md)** をご覧ください。
2. **[行動規範 (CODE_OF_CONDUCT.md)](CODE_OF_CONDUCT.md)** を遵守してください。
3. セキュリティ上の問題を発見した場合は、**[セキュリティポリシー (SECURITY.md)](SECURITY.md)** に従ってご報告ください。

---

## ❤️ 開発者をサポート

SRouter が日々の開発コスト削減や生産性向上にお役に立ちましたら、ぜひ継続的な開発のご支援をお願いいたします：

[![Trakteer](https://img.shields.io/badge/Trakteer-e11d48?style=for-the-badge&logo=ko-fi&logoColor=white)](https://trakteer.id/baiibayu/tip)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/baiibayu)
[![PayPal](https://img.shields.io/badge/PayPal-0070BA?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.me/baiibayu)

---

## 📄 ライセンスと免責事項

- **ライセンス：** オープンソース [MIT License](LICENSE) の下で公開されています。
- **免責事項：** SRouter は個人の研究開発、プロトタイピング、コーディングエージェントの最適化を目的として設計されています。各無料利用枠の運用は各提供元の利用規約に準拠します。企業の本番運用には公式のエンタープライズ有料エンドポイントを推奨します。

<div align="center">
<sub>Crafted with passion by <b>Bayu Indra Sugiharto (<a href="https://github.com/baiibayu">@baiibayu</a>)</b> & community contributors.</sub>
</div>
