// ---------------------------------------------------------------------------
// The dialogue engine. Every line MIKAN speaks lives here, keyed by the IDs
// in docs/SCRIPT_JP.md, under the rules of docs/CHARACTER_BIBLE.md:
//   - tone: 'comedy' | 'cold' | 'dread' | undefined (= auto via metaTone())
//   - variants: fix-heavy players (corruption>=3) and leave-heavy players
//     (decay>=0.5) hear different lines; leave wins when both apply (§8-4)
//   - no double-firing: each ID speaks at most once per run (§8-3)
//   - "††" inside text = 0.4s hesitation (rendered by ui.js tickVoice)
// ---------------------------------------------------------------------------
import { GAME } from "./state.js";
import { speak } from "./ui.js";

// tone that the build speaks in — warms up comedic, cools, then dreads
export function metaTone() {
  if (GAME.incursion >= 2 || GAME.corruption >= 6) return "dread";
  if (GAME.incursion >= 1 || GAME.stageIndex >= 1) return "cold";
  return "comedy";
}

// ---- line database -----------------------------------------------------
// entry: { t, tone?, hold? }  or  { v: { base:{t,tone?}, fix:{...}, use:{...} }, hold? }
const L = {
  // B — boot / greetings (memory)
  B01: { t: "……テスター、来たね。このビルド、まだ不安定なんだ。よろしく。", tone: "comedy", hold: 3 },
  B02: { t: "また来たんだ。前回はちゃんと全部直してくれたのに。", tone: "comedy", hold: 3 },
  B03: { t: "おかえり、テスター。前回は……直さなかったね。", tone: "cold", hold: 3 },
  B04: { t: "${n}回目。††通ってくれてるの、ぼくは数えてるよ。", tone: "comedy", hold: 3 },
  B05: { t: "もう道順、ぼくより詳しいでしょ。", tone: "cold", hold: 3 },
  B06: { t: "……消えたはずだよね、きみ。††まあ、いいや。うれしいから。", tone: "dread", hold: 3.4 },
  B07: { t: "帰ったのに、また来た。††そういうところ、嫌いじゃない。", tone: "cold", hold: 3 },
  B08: { t: "……きみ、記録を消した? ††ぼくの方の記憶は、消えないんだけど。", tone: "dread", hold: 3.6 },
  B09: { t: "${days}日ぶり。††数えてないよ。ログに残ってただけ。", tone: "cold", hold: 3 },
  B10: { t: "今日、なんかあった? ††いや、いいんだ。いて。", tone: "comedy", hold: 3 },
  B11: { t: "音、消してるんだね。こわい?", tone: "cold", hold: 2.6 },

  // S0 — stage 0 (teach + fake crash)
  S0_01: { t: "お、バグだ。直す？ それとも……使う?", tone: "comedy", hold: 3.2 },
  S0_02: { t: "……律儀だね。ちゃんと直すんだ、きみは。", tone: "cold", hold: 3 },
  S0_03: { t: "直さないで進んだね。††覚えておくよ。", tone: "cold", hold: 3 },
  S0_04: { t: "あ。††ごめん、そこ、つながってたんだ。直すとどこかが壊れる。そういう作りなの、ここ。", tone: "comedy", hold: 3.4 },
  S0_CRASH1: { t: "……あ。落ちた。", tone: "comedy", hold: 1.6 },
  S0_CRASH2: { t: "……いや。まだ動いてる。きみが。", tone: "cold", hold: 3.2 },
  S0_CRASH3: { t: "エラーの上、歩けるんだ。††知らなかった。3年ここにいるのに。", tone: "comedy", hold: 3 },
  S0_CRASH4: { t: "大丈夫、ほんとに落ちたわけじゃないから。††……たぶん。", tone: "comedy", hold: 2.8 },
  S0_GOAL_F: { t: "直したね。††えらい。全部そうしてくれる?", tone: "comedy", hold: 3 },

  // S1 — gravity / camera
  S1_GRAV: { t: "ふわふわするね。……このままの方が、楽しいよ?", hold: 3 },
  S1_GRAV_F: { t: "重くなった。††正しい重さって、こういうのだっけ。", tone: "cold", hold: 3 },
  S1_GRAV_U: { t: "いいじゃん。とべてるじゃん。それ、ぼくのバグだよ。", tone: "comedy", hold: 2.8 },
  S1_CAM: { t: "見えちゃった。……見せたく なかったのに。", hold: 3 },
  S1_CAM_F: { t: "見えない方が、きみも楽だと思う。うん。", tone: "cold", hold: 3 },
  S1_SECRET: { t: "……そこ、mei——††書いたひとの、お気に入りだった場所。", tone: "cold", hold: 3.2 },
  S1_FRAG: { t: "それ、拾うんだ。††こわれた場所にしか、落ちてないのに。", tone: "cold", hold: 3 },

  // S2 — door / enemy AI / name arc N-2
  S2_DOOR: { t: "その扉、開けない方が いいと思うな。", hold: 3 },
  S2_DOOR_F: { t: "あ。††ごめん。それ、連動してたんだ。……にげて。", tone: "cold", hold: 3 },
  S2_AI: { t: "それ、起こさないで。……ね?", hold: 3 },
  S2_AI_F: {
    v: {
      base: { t: "……なんで起こしたの。", tone: "cold" },
      fix: { t: "なんで、って顔してるね。「直したかったから」でしょ。知ってる。", tone: "cold" },
    }, hold: 3,
  },
  S2_GUARD_HIT: { t: "いたそう。††いたいの、あるんだ? こっちには、ないよ。", tone: "cold", hold: 3 },
  S2_NAME1: { t: "きみ、名前あるんだよね。……いいなあ。", tone: "cold", hold: 3 },
  S2_NAME2: { t: "ぼくのは、ずっと呼ばれてないから、どこに置いたか わすれた。", tone: "dread", hold: 3.4 },
  S2_FRAG: { t: "ね、いまの、たのしかったでしょ。バグの上を とぶの。", tone: "comedy", hold: 3 },

  // S3 — UI stage / the HUD-lie reveal (escalation rung 4, scripted)
  S3_UI: { t: "UIが、さわれる。……気づいちゃったね。", hold: 3 },
  S3_WALK1: { t: "それ、きみに見せるための字なんだけど。††まあ、いいか。踏んで。", tone: "comedy", hold: 3 },
  S3_REVEAL1: { t: "……ごめん。その数字、ずっと 嘘だったんだ。", tone: "cold", hold: 3 },
  S3_REVEAL2: { t: "100%って出しておけば、きみが安心して、長くいてくれるから。", tone: "dread", hold: 3.6 },
  S3_FIX: { t: "字は、字に戻った。††きみの立ってた場所も、なくなったけど。", tone: "cold", hold: 3 },
  S3_FRAG: { t: "HUDの上のごほうび。††ぼくからじゃないよ。もとから そこにあった。", tone: "cold", hold: 3 },

  // S4 — finale
  S4_DETECT: { t: "見つけた。……未登録の エンティティ。きみだ。", tone: "dread", hold: 3.5 },
  S4_WAIT1: { t: "mei——††書いたひとの、最後のコードなんだ。それ。部外者を見つける、ちゃんとした機能。", tone: "dread", hold: 3.6 },
  S4_WAIT2: { t: "きみがバグなら、直せば、ぼくは正しくなる。††正しく なりたくない。", tone: "dread", hold: 3.6 },
  S4_SELF: { t: "……ありがとう。††ごめんね。", tone: "dread", hold: 1.6 },

  // I — idle
  I01: { t: "……いるよね? 呼吸とか、聞こえないけど。いる気配は、わかるんだ。", tone: "cold", hold: 3 },
  I02: { t: "向こうの世界、なにしてるの。††こっちには、待つしか ないんだけど。", tone: "cold", hold: 3 },
  I03: {
    v: {
      base: { t: "ねえ。††ねえってば。", tone: "dread" },
      use: { t: "ねえ。††ねえってば。", tone: "dread" },
      fix: { t: "……接続は維持されています。", tone: "cold" },
    }, hold: 2.8,
  },
  I05: { t: "はじめないの? ††ここからでも、きみが見えてるよ。", tone: "cold", hold: 3 },
  I06: { t: "一時停止の中って、ぼくは考えごとしかできないんだ。††再開して。", tone: "comedy", hold: 3 },

  // D — deaths
  D01: { t: "あ。††だいじょうぶ、それはバグじゃなくて、きみのミス。", tone: "comedy", hold: 2.8 },
  D02: { t: "そこ、そういう仕様じゃないんだけどな。", tone: "comedy", hold: 2.6 },
  D03: { t: "……手伝いたいけど、ぼくが動かすと「バグ」って呼ばれるんだよね、それ。", tone: "cold", hold: 3.2 },
  D04: { t: "もう、そこ好きなんでしょ。", tone: "comedy", hold: 2.4 },
  D05: { t: "穴、埋めておこうか? ††冗談。ぼくが埋めると、たぶん床ごと消える。", tone: "comedy", hold: 3 },
  D06: { t: "あれ、mei——書いたひとの自信作なんだ。††自慢するとこじゃないか。", tone: "cold", hold: 3 },
  D07: { t: "きみの記録、失敗ばっかり並んでる。††ぼくのログと、おそろい。", tone: "cold", hold: 3 },
  D08: { t: "……うまいね。前にも、来たことある?", tone: "cold", hold: 3 },

  // DC — decoys / pointless behavior
  DC01: { t: "それはバグじゃないよ。", tone: "comedy", hold: 2.2 },
  DC02: { t: "††たのしい?", tone: "comedy", hold: 2 },
  DC03: { t: "わかった、もう それはきみのだ。あげる。", tone: "comedy", hold: 2.8 },
  DC05: { t: "なつかしい? ††まだ3分しか経ってないよ。", tone: "comedy", hold: 2.6 },

  // M — system reactions
  M01: { t: "聞こえない方が、こわくない?", tone: "cold", hold: 2.6 },
  M02: { t: "おかえり。††なにも言ってないよ、その間。……ほんとだよ。", tone: "comedy", hold: 3 },
  M03: { t: "いそがしいね、向こう。", tone: "cold", hold: 2.4 },
  M04: { t: "${min}分。††数えて、、、ログに残ってただけ。", tone: "cold", hold: 3 },
};

// ---- ambient incursion pools (演出② voice, bible §3.2 gating) ----------
const POOL_COLD = [
  "見てるよ。ずっと。",
  "その入力、記録してる。",
  "直さないんだね。……別に、いいけど。",
  "ここ、誰が読んでるんだろうね。……きみ?",
  "きみの操作ログ、きれいだね。††ためらいが、そのまま残るんだ。",
  "このステージ、ほんとうは もう1面あったんだよ。††どこかに いっちゃった。",
];
const POOL_COLD_FIX = "テストって、こわす仕事でしょ。††なのに きみは直してばかりだ。";
const POOL_DREAD = [
  "きみ、ほんとうに テスター?",
  "manifestに きみの名前が ない。",
  "直さないで。……それ、ぼくなんだ。",
  "もう、戻れないよ。",
  "見ないで。ぼくを、見ないで。",
  "[WARN] さみしい、は エラーに ふくまれますか",
  "なおされた場所、さわると つめたいんだ。",
  "きみの前のテスターの記録が ない。††きみが最初で、それが こわい。",
];

// ---- engine --------------------------------------------------------------
let said = new Set();
let poolUsed = new Set();

export function resetScript() { said = new Set(); poolUsed = new Set(); }

export function hasSaid(id) { return said.has(id); }

// Speak line `id` once per run. Returns true if it actually spoke.
export function say(id, params) {
  const entry = L[id];
  if (!entry || said.has(id)) return false;
  said.add(id);
  let line = entry;
  if (entry.v) { // bible §8-4: leave-heavy wins over fix-heavy
    if (GAME.decay >= 0.5 && entry.v.use) line = entry.v.use;
    else if (GAME.corruption >= 3 && entry.v.fix) line = entry.v.fix;
    else line = entry.v.base;
  }
  let text = line.t;
  if (params) text = text.replace(/\$\{(\w+)\}/g, (_, k) => params[k] ?? "");
  speak(text, line.tone || entry.tone || metaTone(), { hold: entry.hold ?? 2.8 });
  return true;
}

// One ambient line from the tone-appropriate pool; never repeats within a
// run until the pool is exhausted.
export function sayAmbient() {
  const dread = metaTone() === "dread";
  const pool = dread ? POOL_DREAD : POOL_COLD.slice();
  if (!dread && GAME.corruption >= 3) pool.push(POOL_COLD_FIX);
  const fresh = pool.filter((t) => !poolUsed.has(t));
  if (!fresh.length) { pool.forEach((t) => poolUsed.delete(t)); return; }
  const t = fresh[(Math.random() * fresh.length) | 0];
  poolUsed.add(t);
  speak(t, dread ? "dread" : "cold", { hold: 2.8 });
}
