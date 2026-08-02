# プロジェクトのファイル連携化 — 設計

- 日付: 2026-08-03
- 対象: `F:\Htlml\3DGS\Locahun3D`(オフライン3DGSビューアー、`src/`編集→`node build.mjs`で単一HTMLへ)
- 発端: 保存の度に3DGS本体を丸ごと再ZIPしなければならない問題（前セッションで「軽量保存＋再アタッチ」を実装済み）に対し、ユーザーから「そもそも“プロジェクト”という概念が画面上に存在しない」という、より根本的な指摘を受けた。

## 背景・経緯

このビューアーはブラウザ内で完結する単一HTMLアプリで、サーバー側の状態を持たない。
これまでの保存/読込は「エクスポート/保存」モーダルから毎回ファイルをダウンロード/ドラッグする単発操作の集まりで、
「今どのプロジェクトを開いているか」を示す仕組みがなく、Word/Photoshopのような「開く→編集→保存」の一貫した体験になっていなかった。

ブレインストーミングで以下を確認・決定した:
- 直したい優先課題は「保存形式の多さ」でも「メニューのラベリング」でもなく、**「プロジェクト」という概念そのものの欠如**
- 実現方法は、ブラウザの **File System Access API** を使った**本物のファイル連携**（Ctrl+S的に同じファイルへ直接上書き）を選択（IndexedDBオートセーブや、UI整理のみの案は不採用）
- メニュー構成は「プロジェクト」と「エクスポート」に分割せず、**既存の単一メニューのまま**。保存ボタンの中身の挙動だけが連携状態に応じて変わる
- 連携状態の表示は、プロジェクト名の右に**バッジ(ピル型ラベル)**「🔗 連携中」/「未保存」
- 上書き失敗時は自動でダウンロードにフォールバック
- 既存の「軽量保存」機能はそのまま残す(Safari等の非対応環境で引き続き有効)

## スコープ

### やること
1. File System Access API による実ファイル連携（開く/保存の両方）
2. 保存ボタン(💾)の状態依存化: 連携中=直接上書き／未連携=`showSaveFilePicker`で新規連携確立、非対応・キャンセル時は現行のダウンロード方式にフォールバック
3. 開く操作の連携化: `showOpenFilePicker`経由で開いた場合はハンドル付きで連携開始。ドラッグ&ドロップ/非対応ブラウザは従来通りハンドルなし(未連携)で開く
4. 連携状態バッジのUI追加(プロジェクト名の右、案A)
5. 上書き失敗時の自動フォールバック+トースト通知+状態を「未保存」に戻す

### やらないこと(明示的に対象外)
- Safari/iPad/iPhone向けの誘導バナーや代替導線の追加 — 「無理ならいいや」で対象外と確定
- ハンドルの永続化(IndexedDB等に保存してタブを閉じても連携を覚えておく)— ハンドルはメモリ上のみ、タブを閉じたら消える前提
- メニュー構成の「プロジェクト」/「エクスポート」への分割 — 単一メニューのまま
- 既存の「軽量保存」「JSONのみ保存」「3DGS/GLB/OBJエクスポート」機能・UIの変更 — 現状維持
- 前セッションで実装した「軽量保存の再アタッチモーダル」の変更 — 現状維持、本設計とは独立した既存機能

## アーキテクチャ

### 状態管理
新規モジュール `src/js/320_file_handle_link.js` を追加し、以下を保持:

```js
let _linkedHandle = null;   // FileSystemFileHandle | null — このタブで連携中のプロジェクトファイル
let _linkedFileName = null; // 表示用（バッジ・タイトル）
```

タブを閉じる/リロードすると自然に消える(意図的に永続化しない)。

機能検出:
```js
function _supportsFSAccess(){
  return typeof window.showSaveFilePicker === 'function'
      && typeof window.showOpenFilePicker === 'function';
}
```

### 保存フロー(`saveProjectZip`の変更点)

`src/js/310_zip_project_save_load_fflate.js` の `saveProjectZip(forceLite)` は、現行通り `zipBuf`(Uint8Array)を組み立てるところまでは一切変更しない。
**変更するのは最後の「書き出し」ステップだけ**——現在はBlob+`<a>`+`.click()`で常にダウンロードしているのを、以下のロジックに差し替える(新関数 `_disposeProjectZip(zipBuf, suggestedName)` として切り出し、full/lite両方から共通で呼ぶ):

```
_disposeProjectZip(zipBuf, suggestedName):
  if (_linkedHandle) {
    try:
      writable = await _linkedHandle.createWritable()
      write zipBuf, close
      toast "✅ 保存しました"（連携中、ダイアログなし）
      return
    catch (e):
      console.warn + 連携を解除 (_linkedHandle = null, バッジ更新)
      toast "⚠ 上書きに失敗したためダウンロードします"
      # そのまま下のダウンロード分岐へフォールスルー

  if (_supportsFSAccess()) {
    try:
      handle = await window.showSaveFilePicker({ suggestedName, types:[{description:'Locahun3D Project', accept:{'application/zip':['.zip']}}] })
      writable = await handle.createWritable()
      write zipBuf, close
      _linkedHandle = handle; _linkedFileName = handle.name
      バッジ更新（連携中）
      toast "✅ 保存しました（以後この場所に上書き保存されます）"
      return
    catch (e):
      # AbortError(ユーザーがキャンセル) 等は下のダウンロードにフォールバック
      if (e.name !== 'AbortError') console.warn(...)

  # 非対応ブラウザ、またはピッカーがキャンセルされた場合 — 現行のダウンロード処理（既存コードそのまま）
  Blob + <a> + click() でダウンロード
```

`forceLite`(軽量保存)は今まで通り `zipBuf` の中身(splatバイトを含めるか)にのみ影響し、書き出し方法(上記の分岐)は full/lite で共通。

### 開くフロー(`loadProjectZip`の変更点)

`src/js/311_zip_load_core.js` の `window.loadProjectZip` を変更:

```
loadProjectZip():
  if (_supportsFSAccess()) {
    try:
      [handle] = await window.showOpenFilePicker({ types:[{description:'Locahun3D Project', accept:{'application/zip':['.zip']}}] })
      file = await handle.getFile()
      await _loadProjectZipFromFile(file)   # 既存のロジックは無変更
      _linkedHandle = handle; _linkedFileName = handle.name
      バッジ更新（連携中）
      return
    catch (e):
      if (e.name === 'AbortError') return   # ユーザーがキャンセル、何もしない
      # それ以外のエラーは下の従来方式にフォールバック
  # 非対応ブラウザ、またはピッカー使用不可時 — 既存の <input type=file> 方式（無変更）
  従来通りのinput.click()フロー
```

ドラッグ&ドロップ経由(`dispatchFiles`→`_loadProjectZipFromFile`)は変更しない——ブラウザの仕様上、ドロップされたFileオブジェクトには書き込み用ハンドルが付随しないため、開いた直後は「未保存」のまま(次の保存で `showSaveFilePicker` を使う新規連携フローに乗る)。

### UI変更

- `src/html/020_view_buttons_ar.html`(`#tb-project-name` の定義箇所、line 82付近)に連携バッジ用の `<span id="tb-link-badge">` を隣接追加
- `320_file_handle_link.js` に `_updateLinkBadge()` を実装: `_linkedHandle` の有無で表示テキスト・スタイルクラス(`.linked` / `.unsaved`)を切替
- バッジを更新するタイミング: ①初回ロード時(常に「未保存」)、②保存で新規連携確立時、③開くで連携確立時、④上書き失敗で連携解除時
- i18n: `tb-link-connected`(🔗 連携中）/ `tb-link-unsaved`(未保存)を `250_i18n.js` の JA/EN辞書 + 自動翻訳配列に追加
- CSS: 案Aのピル型バッジスタイルを `010_style_block.css` に追加(既存の `.em-recommended` 等の小バッジと似た見た目に揃える)

### エラーハンドリング

- 上書き失敗(`createWritable`/`write`/`close`のいずれかで例外): 連携解除→バッジ「未保存」に戻す→ダウンロードにフォールバック→トーストで理由を明示
- `showSaveFilePicker`/`showOpenFilePicker`がユーザーにキャンセルされた場合(`AbortError`): 何もエラー扱いせず、保存側は現行ダウンロードへ、開く側は何もしない(モーダルが閉じるだけ)
- 非対応ブラウザでの動作は現状と完全に同一(コードパスとして機能検出で分岐するのみ、既存コードは無変更)

## 影響範囲・非破壊性の確認

- `saveProjectZip`/`loadProjectZip`のZIP組み立て・展開ロジック本体は無変更 — 変更は「書き出し/読み込みの入出力手段」の追加分岐のみ
- 前セッションで実装した軽量保存・再アタッチモーダル(`_promptFilesForReattach`等)は無変更、独立して動作継続
- Safari/iPad/iPhone/非対応ブラウザでの挙動は現状と完全に同一(退行なし)

## 検証方針

このリポジトリにテストフレームワークは存在しない(既存の合意事項)。今回も**実機ブラウザでの動作確認**で検証する:
- Chrome/Edge: 新規プロジェクトで保存→ハンドル確立→バッジ「連携中」表示→再度保存→ダイアログなしで上書きされることを確認
- 上書き失敗パス: ハンドルを人為的に無効化(例: `_linkedHandle`のモックで書き込み時に例外を投げさせる)し、フォールバック+バッジ復帰を確認
- `showOpenFilePicker`経由での「開く」→連携確立の確認
- ドラッグ&ドロップで開いた場合に連携が確立されない(「未保存」のまま)ことの確認
- Safari(またはUAスプーフ/API検出を無効化した状態)で、保存・開くの両方が完全に従来通りのダウンロード/ファイル選択方式で動作し続けることの確認(退行なし)
