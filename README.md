# DebugRunner

> 「バグを直すか、利用するか——未完成ゲームをテストしているはずが、最後に修正対象になる2Dメタアクション。」

開発中の2Dアクションゲームのテスターとなり、発生したバグを **直す（FIX）** か **利用する（IGNORE）** かを選びながら進むメタ・デバッグアクション。

これは **フェーズ1の縦スライス（動くプロトタイプ）** です。STAGE 0 を、バグ1種（足場判定バグ）の「発生 → デバッグパネル → 修正/利用 → 副作用」の1ループで遊べます。

- 全体のMVP設計書: [`docs/DebugRunner_MVP_Design.md`](docs/DebugRunner_MVP_Design.md)

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

---

## STAGE 0 で体験できること

1. 普通の横スクロールアクションとして進む（右上に `BUILD v0.3.1 (TEST)`）。
2. 中央の足場に近づくと **足場判定バグ（BUG#01）** が発生。床をすり抜けるようになる。
3. `! BUG DETECTED [TAB]` → **TAB** でデバッグパネルを開く。
4. **2つの正解ルート**:
   - **FIX**: 足場を固体化して上ルートを渡る。ただし別の浮きブロックが壊れる（**副作用**）＋ `corruption` が増える。
   - **IGNORE**: 足場をすり抜けたまま下の近道（ショートカット）でゴールへ。バグを“利用”する。
5. ゴール到達でクリア画面（選んだルート・corruption・タイムを表示）。

---

## 構成

```
index.html          画面レイアウト（HUD / ログ / デバッグパネル / クリア画面）
src/
  main.js           ゲームループ・描画・各モジュールの結合
  state.js          共有ステート（カメラ / corruption / ルート など）
  input.js          キー入力（1フレーム・エッジ検出）
  level.js          STAGE 0 のレベルデータ（足場 / ゴール / バグトリガー）
  player.js         2Dキャラクター物理（移動 / 重力 / AABB衝突）
  bugs.js           バグシステム（state機械 + fix/ignore/side-effect）
  ui.js             ログ / トースト / デバッグパネル / クリア画面のDOM制御
  style.css         スタイル
```

## 次の拡張（設計書のフェーズ2以降）

- バグ追加: 重力 / カメラ / 扉 / 敵AI / UI実体化
- 演出段階②③④（ログ侵食 → デバッグ画面侵食 → プレイヤーが修正対象）
- STAGE 1〜4

詳細は [`docs/DebugRunner_MVP_Design.md`](docs/DebugRunner_MVP_Design.md) を参照。
