@echo off
REM ============================================================
REM  PLY -> RAD 変換ツールキット 初回セットアップ (Windows)
REM ============================================================
REM   1. Node / Git / Rust の存在チェック
REM      - 無ければ自動インストール (Node: winget→ポータブルzip,
REM        Git: winget, Rust: rustup GNU ツールチェーン)
REM      - Rust は GNU 版を使うので Visual Studio Build Tools は不要
REM   2. Spark リポジトリをクローン
REM   3. 依存をインストール (ブラウザ WASM ビルドはスキップ)
REM
REM   このスクリプトは初回 1 回だけ実行すれば OK です。
REM   完了後は convert.bat だけで変換できます。
REM ============================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ポータブル版ツールの固定インストール先 (winget が無い PC 用フォールバック)
set "LOCAHUN_TOOLS=%USERPROFILE%\.locahun-tools"
set "LOCAHUN_NODE=%LOCAHUN_TOOLS%\node"
REM ポータブル Node がすでにあれば現セッションの PATH に通す
if exist "%LOCAHUN_NODE%\node.exe" set "PATH=%LOCAHUN_NODE%;%PATH%"

echo.
echo ============================================================
echo   PLY -^> RAD 変換ツールキット セットアップ
echo ============================================================
echo.

REM ── curl の確認 (自動DLに必須) ──
where curl >nul 2>&1
if errorlevel 1 (
  echo [NG] curl コマンドが見つかりません ^(Windows 10 1803+ に標準搭載^)。
  echo      OS が古い可能性があります。Windows を更新してください。
  goto :error
)

REM ── 1. Node.js ──
call :ensure_node
if errorlevel 1 goto :error
for /f "delims=" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node.js   : !NODE_VER!

REM ── 2. npm ──
where npm >nul 2>&1
if errorlevel 1 (
  echo [NG] npm が見つかりません。Node.js インストールに含まれているはずです。
  echo      一度ターミナルを閉じて setup.bat を再実行してください。
  goto :error
)
for /f "delims=" %%v in ('npm --version') do set NPM_VER=%%v
echo [OK] npm       : !NPM_VER!

REM ── 3. Git ──
call :ensure_git
if errorlevel 1 goto :error
for /f "delims=" %%v in ('git --version') do set GIT_VER=%%v
echo [OK] Git       : !GIT_VER!

REM ── 4. Rust (cargo) ──
call :ensure_rust
if errorlevel 1 goto :error
for /f "delims=" %%v in ('cargo --version') do set CARGO_VER=%%v
echo [OK] Rust cargo: !CARGO_VER!

echo.
echo すべての必要環境が揃っています。
echo.

REM ── 5. spark/ サブフォルダの確認 / クローン ──
if exist "spark\.git" (
  echo [INFO] spark/ フォルダは既に存在します。git pull で更新します...
  pushd spark
  git pull
  if errorlevel 1 (
    echo [WARN] git pull に失敗しました。既存の spark/ をそのまま使用します。
  )
  popd
) else (
  if exist "spark\" (
    echo [WARN] spark/ フォルダは存在しますが Git リポジトリではありません。
    echo        既存の spark/ を削除してクローンし直すには、手動で削除してから再実行してください。
    goto :error
  )
  echo [INFO] Spark リポジトリをクローンしています...
  echo        ^(ネット速度により数十秒～数分かかる場合があります^)
  git clone --depth 1 https://github.com/sparkjsdev/spark.git
  if errorlevel 1 (
    echo [NG] git clone に失敗しました。
    goto :error
  )
)
echo [OK] Spark リポジトリ準備完了

echo.
echo [INFO] Spark の依存をインストール ^+ Rust ツールチェーンをビルドします...
echo        ^(初回は 5～15 分かかります^)
echo.

REM --ignore-scripts: Spark の "prepare" は npm run build:wasm
REM (wasm-pack → ブラウザ用 WASM) を走らせますが、PLY->RAD 変換は
REM ネイティブ build-lod (cargo) だけで完結し、ブラウザ WASM も
REM wasm-pack も不要です。さらに wasm-pack 自体が C リンカを要求し
REM ビルドが落ちるため、ライフサイクルスクリプトをスキップします。
REM node_modules は生成されるので convert.bat の存在チェックは通ります。
pushd spark
call npm install --ignore-scripts
set NPM_INSTALL_EXIT=!errorlevel!
popd

if !NPM_INSTALL_EXIT! neq 0 (
  echo.
  echo [NG] npm install に失敗しました。
  echo      上記のエラーメッセージを確認してください。
  goto :error
)

echo.
echo ============================================================
echo   セットアップ完了 ^!
echo ============================================================
echo.
echo   次のステップ:
echo   1. 変換したい .ply / .spz / .sog ファイルを
echo      convert.bat にドラッグ^&ドロップ
echo   2. 入力と同じフォルダに ^<basename^>.rad が生成されます
echo.
pause
exit /b 0

REM ============================================================
REM  Subroutine: Node.js を用意 (winget → ポータブルzip)
REM ============================================================
:ensure_node
where node >nul 2>&1
if not errorlevel 1 exit /b 0

echo.
echo [INFO] Node.js が見つかりません。自動インストールを行います。
echo.

REM --- 方法A: winget (PATH を恒久的に通してくれる) ---
where winget >nul 2>&1
if not errorlevel 1 (
  echo [INFO] winget で Node.js LTS をインストール中...
  winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
  REM winget は現セッションの PATH を更新しないので標準パスを手動追加
  if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;!PATH!"
  if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;!PATH!"
  where node >nul 2>&1
  if not errorlevel 1 (
    echo [OK] Node.js winget インストール完了
    exit /b 0
  )
  echo [WARN] winget 経由で導入できませんでした。ポータブル版を試します。
)

REM --- 方法B: ポータブル zip を %USERPROFILE%\.locahun-tools\node へ展開 ---
set "NODE_DL=v24.15.0"
set "NODE_ZIP=%TEMP%\locahun-node.zip"
set "NODE_EXTRACT=%TEMP%\locahun-node-x"

echo [INFO] Node.js ポータブル版 ^(!NODE_DL!^) をダウンロード中...
curl.exe -fSL -o "!NODE_ZIP!" "https://nodejs.org/dist/!NODE_DL!/node-!NODE_DL!-win-x64.zip"
if errorlevel 1 (
  echo [NG] Node.js のダウンロードに失敗しました。
  echo      ネットワークを確認するか、手動で https://nodejs.org/ja から導入してください。
  exit /b 1
)

echo [INFO] 展開中...
if exist "!NODE_EXTRACT!" rmdir /s /q "!NODE_EXTRACT!" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%NODE_ZIP%' -DestinationPath '%NODE_EXTRACT%' -Force"
if errorlevel 1 (
  echo [NG] zip の展開に失敗しました。
  exit /b 1
)

if exist "%LOCAHUN_NODE%" rmdir /s /q "%LOCAHUN_NODE%" >nul 2>&1
if not exist "%LOCAHUN_TOOLS%" mkdir "%LOCAHUN_TOOLS%" >nul 2>&1
REM zip 内は node-vXX-win-x64\ の 1 階層なのでそれを丸ごとリネーム移動
move "!NODE_EXTRACT!\node-!NODE_DL!-win-x64" "%LOCAHUN_NODE%" >nul 2>&1
del /f /q "!NODE_ZIP!" >nul 2>&1
rmdir /s /q "!NODE_EXTRACT!" >nul 2>&1

if not exist "%LOCAHUN_NODE%\node.exe" (
  echo [NG] ポータブル Node.js の配置に失敗しました。
  exit /b 1
)
set "PATH=%LOCAHUN_NODE%;!PATH!"
where node >nul 2>&1
if errorlevel 1 (
  echo [NG] Node.js を導入できませんでした。
  exit /b 1
)
echo [OK] Node.js ポータブル版インストール完了
echo      ^(%LOCAHUN_NODE% に配置。convert.bat も自動で参照します^)
exit /b 0

REM ============================================================
REM  Subroutine: Git を用意 (winget)
REM ============================================================
:ensure_git
where git >nul 2>&1
if not errorlevel 1 exit /b 0

echo.
echo [INFO] Git が見つかりません。自動インストールを行います。
echo.

where winget >nul 2>&1
if errorlevel 1 (
  echo [NG] Git が無く、winget も使えないため自動導入できません。
  echo      https://git-scm.com/ から Git をインストールして
  echo      ターミナルを開き直し、再度 setup.bat を実行してください。
  exit /b 1
)

echo [INFO] winget で Git をインストール中...
winget install -e --id Git.Git --silent --accept-source-agreements --accept-package-agreements
REM winget は現セッションの PATH を更新しないので標準パスを手動追加
if exist "%ProgramFiles%\Git\cmd\git.exe" set "PATH=%ProgramFiles%\Git\cmd;!PATH!"
if exist "%ProgramFiles(x86)%\Git\cmd\git.exe" set "PATH=%ProgramFiles(x86)%\Git\cmd;!PATH!"
where git >nul 2>&1
if errorlevel 1 (
  echo [NG] Git を導入できませんでした。
  echo      一度ターミナルを閉じて setup.bat を再実行するか、
  echo      https://git-scm.com/ から手動でインストールしてください。
  exit /b 1
)
echo [OK] Git winget インストール完了
exit /b 0

REM ============================================================
REM  Subroutine: Rust (cargo) を用意 (rustup-init)
REM ============================================================
:ensure_rust
REM Windows の Rust は既定で MSVC ターゲット。そのリンカ link.exe は
REM Visual Studio C++ Build Tools (数GB・管理者権限) にしか付属しません。
REM ダブルクリックだけで完結させるため GNU ツールチェーンを使います。
REM rustup の rust-mingw コンポーネントが自己完結リンカを同梱するので
REM Visual Studio は一切不要。build-lod の依存
REM (anyhow / serde_json / wgpu / spark-lib) は GNU で問題なくビルド可。
set "RUST_GNU=stable-x86_64-pc-windows-gnu"

where cargo >nul 2>&1
if not errorlevel 1 goto :rust_have_cargo

echo.
echo [INFO] Rust ^(cargo^) が見つかりません。自動インストールを行います。
echo        ^(rustup-init.exe / GNU ツールチェーン。Visual Studio 不要^)
echo.

set "RUSTUP_TMP=%TEMP%\rustup-init.exe"
echo [INFO] rustup-init.exe をダウンロード中...
curl.exe -fSL -o "!RUSTUP_TMP!" https://win.rustup.rs/x86_64
if errorlevel 1 (
  echo [NG] rustup-init.exe のダウンロードに失敗しました。
  echo      ネットワークを確認するか、手動で https://rustup.rs/ から導入してください。
  exit /b 1
)

echo [INFO] Rust をインストール中... ^(数分かかります^)
"!RUSTUP_TMP!" -y --default-toolchain !RUST_GNU! --profile minimal --default-host x86_64-pc-windows-gnu
set RUSTUP_EXIT=!errorlevel!
del /f /q "!RUSTUP_TMP!" >nul 2>&1
if !RUSTUP_EXIT! neq 0 (
  echo [NG] Rust インストールに失敗しました ^(exit !RUSTUP_EXIT!^)。
  echo      手動で https://rustup.rs/ から導入してください。
  exit /b 1
)

set "PATH=%USERPROFILE%\.cargo\bin;!PATH!"
where cargo >nul 2>&1
if errorlevel 1 (
  echo [NG] Rust インストール直後にも cargo が見つかりません。
  echo      一度ターミナルを閉じて setup.bat を再実行してください。
  exit /b 1
)
echo [OK] Rust 自動インストール完了 ^(GNU toolchain^)
exit /b 0

:rust_have_cargo
REM cargo は既にある。MSVC リンカ link.exe があれば VS 入り PC なので
REM そのまま。無ければ GNU ツールチェーンへ切替えて VS 不要にする。
where link >nul 2>&1
if not errorlevel 1 (
  echo [OK] Rust cargo: 既存 ^(MSVC link.exe 検出^)
  exit /b 0
)
echo [INFO] C リンカ ^(link.exe^) が無いため Rust を GNU ツールチェーンへ切替...
where rustup >nul 2>&1
if errorlevel 1 set "PATH=%USERPROFILE%\.cargo\bin;!PATH!"
rustup toolchain install !RUST_GNU! --profile minimal
if errorlevel 1 (
  echo [NG] GNU ツールチェーンの取得に失敗しました。
  echo      ネットワークを確認して再実行してください。
  exit /b 1
)
rustup default !RUST_GNU!
if errorlevel 1 (
  echo [NG] GNU ツールチェーンへの切替に失敗しました。
  exit /b 1
)
echo [OK] Rust GNU ツールチェーンへ切替完了 ^(Visual Studio 不要^)
exit /b 0

:error
echo.
echo ============================================================
echo   セットアップ失敗
echo ============================================================
echo.
pause
exit /b 1
