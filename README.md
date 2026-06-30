# DebugRunner

> 「バグを直すか、利用するか——未完成ゲームをテストしているはずが、最後に修正対象になる2Dメタアクション。」

開発中の2Dアクションゲームのテスターとなり、発生したバグを **直す（FIX）** か **利用する（IGNORE）** かを選びながら進むメタ・デバッグアクション。

これは **フェーズ3まで実装した動くプロトタイプ** です。タイトル画面 → STAGE 0〜2 を通しで遊べ、バグ5種（足場判定・重力・カメラ・扉・敵AI）の「発生 → デバッグパネル → 修正/利用 → 副作用」ループと、後半の侵食演出（①違和感／②UI・ログ異変、後半ほど強まる）が入っています。

**▶ プレイ（GitHub Pages・PC/スマホ対応）: https://ryogaaaaaaaaaaa.github.io/DebugRunner/**

- 全体のMVP設計書: [`docs/DebugRunner_MVP_Design.md`](docs/DebugRunner_MVP_Design.md)

## 公開（GitHub Pages）

`claude/debug-action-game-mvp-85b1js` ブランチへ push すると、GitHub Actions（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)）が自動でビルドし `gh-pages` ブランチへ公開します。**初回のみ** リポジトリ設定で Pages を有効化してください:

1. Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: **gh-pages** / **(root)** → Save

数十秒〜数分で上記URLに反映されます。Vite の `base` は相対パス（`./`）なので、itch.io 等の静的ホストにも `dist/` をそのまま置けます。

---

## 動かし方（あなたのPCで）

前提: [Node.js](https://nodejs.org/) 18 以上。

```bash
# 1. このリポジトリを取得して開発ブランチへ
git clone https://github.com/ryogaaaaaaaaaaa/DebugRunner.git
cd DebugRunner
git checkout claude/debug-action-game-mvp-85b1js

# 2. 依存をインストール
npm install

# 3. 開発サーバを起動（ホットリロードあり）
npm run dev
```

表示された `http://localhost:5173/` をブラウザで開けば遊べます。

本番ビルドを確認する場合:

```bash
npm run build     # dist/ に出力
npm run preview   # ビルド結果をローカル配信
```

---

## 操作

| キー | 動作 |
|---|---|
| ← → / A D | 移動 |
| Space / ↑ / W | ジャンプ |
| **TAB** | デバッグパネルの開閉 |
| ← → （パネル内） | FIX / IGNORE の選択 |
| Enter | 決定 |
| R | クリア後にリトライ |

### スマホ（タッチ操作）
PC・スマホ両対応です。タッチ端末では自動で画面下に操作ボタンが出ます。
- 画面サイズに合わせて自動スケール（横持ち推奨。縦持ちでは回転ヒントを表示）
- **◀ ▶**：移動／**JUMP**：ジャンプ／**⚙ DEBUG**：デバッグパネル開閉
- デバッグパネルの **[FIX] / [IGNORE] は直接タップ**で決定。タイトルの START・クリア後の CONTINUE/RETRY もタップ可。

---

## ステージ内容

### STAGE 0 — TEST BUILD（チュートリアル / BUG#01 足場判定）
1. 普通の横スクロールアクションとして進む（右上に `BUILD v0.3.1 (TEST)`）。
2. 中央の足場で **足場判定バグ（BUG#01）** が発生。床をすり抜ける。
3. `! BUG DETECTED [TAB]` → **TAB** でデバッグパネル。
4. **2つの正解ルート**:
   - **FIX**: 足場を固体化して上を渡る。別の浮きブロックが壊れる（**副作用**）＋ `corruption` +1。
   - **IGNORE**: すり抜けたまま下の近道でゴールへ（バグ“利用”）。

### STAGE 1 — SHORTCUT（BUG#03 重力 ＋ BUG#05 カメラ）
- 進入すると **カメラバグ**（視界の固定が外れ、上方の隠しルートが見える）と **重力バグ**（低重力でフワフワ）が発生。デバッグパネルには **2件のバグ** が並ぶ。
- **重力 FIX**: 通常重力に戻り、足場を正確にホップして渡る。浮き足場 `floaty` が落ちる（**副作用**）。
- **重力 IGNORE**: 低重力のまま大ジャンプ。カメラが見せた **隠しレッジ（ボーナス）** に届く“利用”ルート。
- どちらを選んでもクリア可能（落ちても下の安全床で受け止める）。
- このステージから **侵食演出②**：ログに“tester”を指す不穏な行が混じり、ビルド表示がたまに化け、画面に薄いスキャンライン。

### STAGE 2 — SIDE EFFECTS（BUG#02 扉 ＋ BUG#04 敵AI）★駆け引きの核
- ゴールへ **2つのルート** が並走する。
- **TOP**：階段で上のレッジへ。**停止中（バグ）の敵**が居る → 飛び越えて進む（バグ利用）。
- **BOTTOM**：地上の通路を **閉じたままの扉** が塞ぐ → 扉を **FIX** して通る。
- **「直してはいけない」駆け引き**：
  - 敵は **バグって停止中＝安全**（足場/障害物として無害）。**FIX すると正常化して動き出し、接触で戻される＝危険**。→ この敵は直さないのが正解。
  - **扉を FIX すると、副作用で敵が起動する（副作用の連鎖）**。どちらの道を選ぶか・何を直すかで状況が変わる。
- このステージから **侵食演出が一段深くなる**（スキャンラインが速く明滅、不穏ログ増加）。

クリアで全体の総括画面（各ステージの判断・corruption・タイム）。

---

## 構成

```
index.html          画面レイアウト（HUD / ログ / デバッグパネル / クリア画面）
src/
  main.js           ゲームループ・描画・ステージ進行・侵食・各モジュール結合
  state.js          共有ステート（カメラ / corruption / 侵食 / 重力スケール など）
  input.js          キー入力（1フレーム・エッジ検出）
  stages.js         全ステージのレベルデータ + バグ定義（state機械 + fix/ignore/副作用）
  player.js         2Dキャラクター物理（移動 / 可変重力 / AABB衝突）
  ui.js             ログ / トースト / デバッグパネル / クリア画面 / 侵食演出のDOM制御
  style.css         スタイル（侵食スキャンライン等を含む）
```

デバッグ用に `window.__DR`（`GAME` / `player` / `stage`）を公開しています（デバッグゲームらしく、調整・検証に便利なため）。

## 次の拡張（設計書のフェーズ4以降）

- バグ追加: UI実体化（HUD/ログに当たり判定 → 足場として利用）
- 演出段階③④（デバッグ画面そのものの侵食 → プレイヤー自身が修正対象）
- STAGE 3（UI侵食）〜 STAGE 4（ラスト）

詳細は [`docs/DebugRunner_MVP_Design.md`](docs/DebugRunner_MVP_Design.md) を参照。
