# PLY → RAD 変換ツールキット

PLY / SPZ / SOG ファイルを Spark の **RAD 形式** (LoD + チャンクストリーミング対応)
にローカル変換するスクリプト集です。**入力ファイルの隣に `.rad` が出力されます**。

PLY 入力時は **-90°のX軸回転を自動適用**してから build-lod に渡します
(ロケハン3D ビューワーで上向きになる向きに合わせるため)。
`rotate_ply.js` が positions / normals / 3DGS rotation quaternion を回転します。
高次の SH (`f_rest_*`) があると警告が出ます (Wigner D 行列の適用は未実装)。

## 使い方は 3 ステップ

### 1. 解凍 → 好きな場所に置く

`ply-to-rad-tools.zip` を解凍。Desktop でも Documents でも、好きなフォルダで OK。

### 2. 初回セットアップ(一度だけ)

#### Windows
`setup.bat` をダブルクリック。

#### macOS / Linux
```bash
chmod +x setup.sh convert.sh
./setup.sh
```

初回は **5〜15 分** かかります(Spark リポジトリのクローン + Rust ビルド)。

### 3. ドラッグ&ドロップで変換

#### Windows

変換したい `.ply` / `.spz` / `.sog` ファイルを **`convert.bat` にドラッグ&ドロップ**。

→ ドロップ元の同じフォルダに `<basename>.rad` が生成されます。

#### macOS / Linux

```bash
./convert.sh path/to/file1.ply
```

## 複数ファイルのマージ変換

**複数の PLY ファイルを 1 つの RAD にまとめる**ことができます。
別々にスキャンした空間を統合する場合などに使います。

### ドラッグ&ドロップ（Windows）

複数の `.ply` ファイルをまとめて `convert.bat` にドラッグ&ドロップすると、
選択画面が表示されます：

```
  [1] 個別変換  — 各ファイルごとに .rad を生成
  [2] マージ変換 — 全ファイルを統合して 1 つの .rad を生成
```

`2` を選ぶと全 PLY を 1 つにマージしてから RAD 変換します。
出力は `<最初のファイル名>_merged.rad` です。

### コマンドライン

```bash
# Windows
convert.bat --merge "scene_part1.ply" "scene_part2.ply" "scene_part3.ply"

# macOS / Linux
./convert.sh --merge scene_part1.ply scene_part2.ply scene_part3.ply
```

`--merge` フラグで選択画面をスキップしてマージ変換を直接実行します。

### マージ変換の制約

- **PLY ファイルのみ対応**です（SPZ / SOG はマージ不可）
- 全 PLY の**プロパティ構成が同一**である必要があります（同じスキャナ/変換パイプラインで作成されたファイル同士）
- PLY 以外のファイルが混在している場合、PLY はマージ、その他は個別変換されます

### マージ変換の処理フロー

```
scene_part1.ply ─┐
scene_part2.ply ─┤ ①回転(-90°X) → ②マージ → ③build-lod → scene_part1_merged.rad
scene_part3.ply ─┘
```

## 出力例

### 個別変換

```
Desktop/
├── my_scene.ply       ← ここにドロップ
└── my_scene.rad       ← 変換後、同じフォルダに出力 (新規生成)
```

### マージ変換

```
Desktop/
├── part_A.ply          ← 3 ファイルをまとめてドロップ
├── part_B.ply
├── part_C.ply
└── part_A_merged.rad   ← 統合された 1 ファイル
```

## 動作要件

セットアップ実行時に自動チェックされます。不足していれば案内が出ます。

| ツール | 用途 | インストール |
|---|---|---|
| **Node.js LTS** | npm スクリプト実行 | **未導入なら setup が自動でインストール** |
| **Git** | Spark リポジトリのクローン | **未導入なら setup が自動でインストール** |
| **Rust(rustup)** | Spark の build-lod は Rust 製 | **未導入なら setup が自動でインストール** |

> **Windows (`setup.bat`)** は 3 つすべてを自動導入します:
> - **Node.js**: まず `winget` で LTS を、無ければ公式ポータブル zip を
>   `%USERPROFILE%\.locahun-tools\node` に展開（管理者権限不要）。
>   `convert.bat` もこのパスを自動参照します。
> - **Git**: `winget` で導入。winget が無い古い Windows では
>   <https://git-scm.com/> から手動インストール後に再実行。
> - **Rust**: `rustup` の **GNU ツールチェーン** (`stable-x86_64-pc-windows-gnu`)
>   を非対話で導入。GNU 版はリンカを自己完結で同梱するため
>   **Visual Studio C++ Build Tools は不要**です。既に MSVC 版 Rust が
>   入っていて `link.exe` が無い PC は、自動で GNU へ切替えます。
> - Spark の `npm install` は `--ignore-scripts` で実行します。ブラウザ用
>   WASM ビルド (wasm-pack) は PLY→RAD 変換に不要なためスキップします。
> - `convert.bat` は build-lod を `cargo --no-default-features` でビルド
>   します。GPU 機能 (wgpu) を外すことで GNU ツールチェーンが要求する
>   `dlltool.exe` (MinGW binutils) 不要になります。SH クラスタリングは
>   CPU フォールバックがあるため出力品質は同等です。
>
> winget は Windows 10 1809+ / Windows 11 に標準搭載。導入後は一度
> ターミナルを閉じて `setup.bat` を再実行すると確実です。

## 変換時間とサイズの目安

| 元データ | 変換時間 | 出力サイズ |
|---|---|---|
| 100万点群 | 1〜3 秒 | 約 4.5x の膨張 |
| 500万点群 | 約 5 分 | ~250MB(元 58MB) |
| 上限 | 約 3000 万点 | — |

ファイルサイズは膨張しますが、ロケハン3D ビューワーで読み込む際は
**LoD 階層のうち必要な分だけ**取得されるため、実際の表示は元 PLY より遥かに高速です。

マージ変換の場合、合計点数が上限を超えないよう注意してください。

## 生成された `.rad` の使い方

### ロケハン3D ビューワーで直接開く(オフライン)

1. ビューワーを開く(`Locahun3D_OfflineViewer.html`)
2. `.rad` ファイルを画面にドラッグ&ドロップ
3. 自動的に LoD ストリーミング再生

### URL 経由で配信(CDN ホスト時)

```
https://locahun3d.nakamurakou1108.workers.dev/?autoload=https://your-cdn.com/scene.rad
```

→ HTTP Range Request チャンクストリーミングで 5 秒以内に初期表示。

## トラブルシューティング

### Rust 自動インストールに失敗した

ネットワーク制限などで `setup.bat` 内の自動インストールが失敗した場合は、
<https://rustup.rs/> から `rustup-init.exe` を手動で実行 →
ターミナル(コマンドプロンプト)を**完全に閉じて再起動**してから `setup.bat` を再実行してください。

### Node.js のバージョンエラー

```bash
node --version
```
で `v18.x.x` 以上が表示されない場合は <https://nodejs.org/ja> から最新 LTS をインストール。

### 変換中に「out of memory」

巨大シーン(> 2000 万点)で発生する可能性があります。
スプラットを分割するか、より大きい RAM を持つマシンで実行してください。
マージ変換で複数ファイルを統合する場合は、合計点数に注意してください。

### マージ変換で「Property layout mismatch」

マージする PLY ファイルの頂点プロパティ構成が異なる場合に発生します。
同じスキャナ・同じ変換パイプラインで作成された PLY 同士でないとマージできません。
異なる構成のファイルは個別変換してください。

### Spark を最新版に更新したい

```bash
cd spark
git pull
npm install
```

または `setup.bat` / `setup.sh` を再実行すれば自動で `git pull` されます。

### `.rad` が変換後に見つからない

build-lod の出力ファイル名は実装により異なる場合があります。
ドロップ元のフォルダで `*.rad` を手動検索してみてください。
スクリプトは `<basename>-lod.rad` / `<basename>_lod.rad` / `<basename>.rad` の順で探します。

## ライセンス

- 本ツール群(`convert.bat` / `setup.bat` / `convert.sh` / `setup.sh` / `rotate_ply.js` / `merge_ply.js` / README): Apache License 2.0
- Spark 本体(`spark/` 以下、setup.bat 実行で生成): MIT License(World Labs)
- 生成された `.rad` ファイルの権利は元 PLY の著作権者に帰属します

## 関連リンク

- ロケハン3D ビューワー: <https://locahun3d.nakamurakou1108.workers.dev>
- Spark リポジトリ: <https://github.com/sparkjsdev/spark>
- 3Dasset.io(Web 上で同じ変換が可能): <https://3dasset.io/>
- 参考記事(matsutomato): <https://qiita.com/matsutomato/items/c04c5294e40e61571b3c>
