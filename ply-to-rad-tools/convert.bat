@echo off
REM ============================================================
REM  PLY -> RAD ドラッグ&ドロップ変換 (Windows)
REM ============================================================
REM  使い方:
REM    1. このバッチファイルを Desktop など好きな場所に置く
REM    2. 変換したい .ply / .spz / .sog ファイルを
REM       このバッチファイルにドラッグ&ドロップ
REM    3. 入力と同じフォルダに <basename>.rad が生成される
REM
REM  複数ファイルをドロップした場合:
REM    - 個別変換: 各ファイルごとに .rad を生成
REM    - マージ変換: 全ファイルを統合して 1 つの .rad を生成
REM    どちらにするか選択画面が表示されます。
REM
REM  コマンドラインからの呼び出し例:
REM    convert.bat "C:\path\to\file.ply"
REM    convert.bat --merge "file1.ply" "file2.ply" "file3.ply"
REM ============================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

REM Node / cargo にパスが通っていないターミナルで実行されたケースの保険。
REM setup.bat がポータブルで入れた場合 (%USERPROFILE%\.locahun-tools\node)
REM や rustup の既定の cargo bin を現セッションの PATH に追加します。
if exist "%USERPROFILE%\.locahun-tools\node\node.exe" set "PATH=%USERPROFILE%\.locahun-tools\node;%PATH%"
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

REM ── Spark のセットアップ確認 ──
if not exist "spark\node_modules" (
  echo.
  echo [NG] Spark のセットアップが完了していません。
  echo      まず setup.bat をダブルクリックして初回セットアップを行ってください。
  echo.
  pause
  exit /b 1
)

REM ── 引数がなければドロップを促すメッセージ ──
if "%~1"=="" (
  echo.
  echo ============================================================
  echo   PLY -^> RAD ドラッグ^&ドロップ変換
  echo ============================================================
  echo.
  echo   このバッチファイルに、変換したい .ply / .spz / .sog
  echo   ファイルをドラッグ^&ドロップしてください。
  echo.
  echo   出力 .rad は入力と同じフォルダに保存されます。
  echo.
  echo   複数ファイルをドロップすると、個別変換かマージ変換を
  echo   選択できます。
  echo.
  pause
  exit /b 0
)

REM ── --merge フラグの検出 ──
set "FORCE_MERGE=0"
if /i "%~1"=="--merge" (
  set "FORCE_MERGE=1"
  shift
)

REM ── ファイル数のカウント ──
set "FILE_COUNT=0"
set "ALL_FILES="
for %%A in (%*) do (
  set /a FILE_COUNT+=1
)
REM --merge の場合カウントを調整（shiftで1つ消えている）
if "!FORCE_MERGE!"=="1" set /a FILE_COUNT-=0

REM 引数を配列的に保持（バッチの制約で %* を再走査）
set "IDX=0"
for %%A in (%*) do (
  if /i not "%%~A"=="--merge" (
    set "FILE_!IDX!=%%~fA"
    set /a IDX+=1
  )
)
set "FILE_COUNT=!IDX!"

REM ── 1 ファイルなら従来どおり個別変換 ──
if !FILE_COUNT! LEQ 1 (
  echo.
  echo ============================================================
  echo   PLY -^> RAD 変換開始
  echo ============================================================
  call :convert_one "!FILE_0!"
  goto :finish
)

REM ── 複数ファイル: モード選択 ──
echo.
echo ============================================================
echo   PLY -^> RAD 変換  （!FILE_COUNT! ファイル検出）
echo ============================================================
echo.

if "!FORCE_MERGE!"=="1" (
  set "MODE=2"
  echo   --merge 指定: マージ変換モード
  goto :run_mode
)

echo   [1] 個別変換  — 各ファイルごとに .rad を生成
echo   [2] マージ変換 — 全ファイルを統合して 1 つの .rad を生成
echo.
set /p "MODE=  番号を入力 (1 or 2): "

:run_mode
if "!MODE!"=="1" goto :mode_individual
if "!MODE!"=="2" goto :mode_merge

echo   [NG] 1 か 2 を入力してください。
pause
exit /b 1

REM ============================================================
REM  モード 1: 個別変換
REM ============================================================
:mode_individual
echo.
echo ============================================================
echo   個別変換モード
echo ============================================================

for /L %%I in (0,1,!FILE_COUNT!) do (
  if %%I LSS !FILE_COUNT! (
    call :convert_one "!FILE_%%I!"
  )
)
goto :finish

REM ============================================================
REM  モード 2: マージ変換
REM ============================================================
:mode_merge
echo.
echo ============================================================
echo   マージ変換モード
echo ============================================================

REM PLY 以外が含まれている場合は警告
set "NON_PLY=0"
set "PLY_COUNT=0"
for /L %%I in (0,1,!FILE_COUNT!) do (
  if %%I LSS !FILE_COUNT! (
    set "FPATH=!FILE_%%I!"
    set "FEXT=!FPATH:~-4!"
    if /i "!FEXT!"==".ply" (
      set /a PLY_COUNT+=1
    ) else (
      set /a NON_PLY+=1
    )
  )
)

if !NON_PLY! GTR 0 (
  echo.
  echo [WARN] PLY 以外のファイルが !NON_PLY! 件含まれています。
  echo        マージ変換は PLY ファイルのみ対応です。
  echo        PLY 以外は個別変換にフォールバックします。
  echo.
)

if !PLY_COUNT! LSS 2 (
  echo [INFO] マージ対象の PLY が 1 件以下のため、個別変換を実行します。
  goto :mode_individual
)

REM Step 1: 各 PLY を回転
echo.
echo [STEP 1/3] PLY を -90° X 軸回転中...
set "ROT_IDX=0"
set "ROT_FILES="
for /L %%I in (0,1,!FILE_COUNT!) do (
  if %%I LSS !FILE_COUNT! (
    set "FPATH=!FILE_%%I!"
    set "FEXT=!FPATH:~-4!"
    if /i "!FEXT!"==".ply" (
      for %%F in ("!FPATH!") do (
        set "RNAME=%%~dpF%%~nF_rotX-90.ply"
      )
      echo   [!ROT_IDX!] 回転中: !FPATH!
      node "%~dp0rotate_ply.js" "!FPATH!" "!RNAME!"
      if errorlevel 1 (
        echo [NG] 回転処理に失敗しました: !FPATH!
        goto :merge_cleanup
      )
      set "ROT_!ROT_IDX!=!RNAME!"
      set /a ROT_IDX+=1
    )
  )
)

REM Step 2: 回転済み PLY をマージ
echo.
echo [STEP 2/3] !ROT_IDX! ファイルをマージ中...

REM 出力先: 最初のファイルのフォルダに <最初のファイル名>_merged.ply
for %%F in ("!FILE_0!") do (
  set "MERGE_DIR=%%~dpF"
  set "MERGE_BASE=%%~nF"
)
set "MERGED_PLY=!MERGE_DIR!!MERGE_BASE!_merged.ply"

REM merge_ply.js の引数を構築
set "MERGE_ARGS="!MERGED_PLY!""
for /L %%I in (0,1,!ROT_IDX!) do (
  if %%I LSS !ROT_IDX! (
    set "MERGE_ARGS=!MERGE_ARGS! "!ROT_%%I!""
  )
)

node "%~dp0merge_ply.js" !MERGE_ARGS!
if errorlevel 1 (
  echo [NG] マージに失敗しました
  goto :merge_cleanup
)

REM Step 3: マージ済み PLY を build-lod で RAD 変換
echo.
echo [STEP 3/3] マージ済み PLY を RAD に変換中...
pushd spark
call cargo run --manifest-path rust/build-lod/Cargo.toml --release --no-default-features -- "!MERGED_PLY!" --quality
set CONV_EXIT=!errorlevel!
popd

if !CONV_EXIT! neq 0 (
  echo [NG] RAD 変換に失敗しました
  goto :merge_cleanup
)

REM 出力ファイルを検索
set "OUT_PATH="
for %%P in (
  "!MERGE_DIR!!MERGE_BASE!_merged-lod.rad"
  "!MERGE_DIR!!MERGE_BASE!_merged_lod.rad"
  "!MERGE_DIR!!MERGE_BASE!_merged.rad"
  "!MERGE_DIR!!MERGE_BASE!_merged.lod.rad"
) do (
  if exist "%%~P" if not defined OUT_PATH set "OUT_PATH=%%~P"
)

if not defined OUT_PATH (
  echo [WARN] 変換は実行されましたが、出力 .rad の場所を特定できませんでした。
  echo        以下のフォルダで *.rad を手動で探してください:
  echo        !MERGE_DIR!
  goto :merge_cleanup
)

REM <最初のファイル名>_merged.rad にリネーム
set "FINAL_RAD=!MERGE_DIR!!MERGE_BASE!_merged.rad"
if /i not "!OUT_PATH!"=="!FINAL_RAD!" (
  move /Y "!OUT_PATH!" "!FINAL_RAD!" >nul
)

echo.
echo [OK] マージ変換完了: !FINAL_RAD!

:merge_cleanup
REM 一時ファイル掃除 (回転済みPLY + マージ済みPLY)
for /L %%I in (0,1,!ROT_IDX!) do (
  if %%I LSS !ROT_IDX! (
    if exist "!ROT_%%I!" del /f /q "!ROT_%%I!" >nul 2>&1
  )
)
if exist "!MERGED_PLY!" del /f /q "!MERGED_PLY!" >nul 2>&1

REM PLY 以外のファイルがあれば個別変換
if !NON_PLY! GTR 0 (
  echo.
  echo [INFO] PLY 以外のファイルを個別変換します...
  for /L %%I in (0,1,!FILE_COUNT!) do (
    if %%I LSS !FILE_COUNT! (
      set "FPATH=!FILE_%%I!"
      set "FEXT=!FPATH:~-4!"
      if /i not "!FEXT!"==".ply" (
        call :convert_one "!FPATH!"
      )
    )
  )
)
goto :finish

REM ============================================================
REM  完了
REM ============================================================
:finish
echo.
echo ============================================================
echo   全ファイルの変換が完了しました。
echo ============================================================
echo.
pause
exit /b 0

REM ============================================================
REM  Sub-routine: 1 ファイル変換（従来動作）
REM ============================================================
:convert_one
set "SRC=%~1"
set "SRC_ABS=%~f1"
set "SRC_DIR=%~dp1"
set "SRC_NAME=%~n1"
set "SRC_EXT=%~x1"

echo.
echo ------------------------------------------------------------
echo   入力: !SRC!
echo ------------------------------------------------------------

if not exist "!SRC_ABS!" (
  echo [NG] ファイルが見つかりません: !SRC!
  goto :eof
)

REM PLY は -90 度 X 軸回転して一時ファイルへ書き出し (.ply のみ対象)
set "BUILD_SRC=!SRC_ABS!"
set "TMP_ROT="
if /i "!SRC_EXT!"==".ply" (
  set "TMP_ROT=!SRC_DIR!!SRC_NAME!_rotX-90.ply"
  echo [INFO] PLY を -90 度 X 回転中...
  node "%~dp0rotate_ply.js" "!SRC_ABS!" "!TMP_ROT!"
  if errorlevel 1 (
    echo [NG] 回転処理に失敗しました
    if exist "!TMP_ROT!" del /f /q "!TMP_ROT!" >nul 2>&1
    goto :eof
  )
  set "BUILD_SRC=!TMP_ROT!"
)

REM Spark の build-lod を実行
pushd spark
call cargo run --manifest-path rust/build-lod/Cargo.toml --release --no-default-features -- "!BUILD_SRC!" --quality
set CONV_EXIT=!errorlevel!
popd

REM 一時 PLY を掃除
if defined TMP_ROT if exist "!TMP_ROT!" del /f /q "!TMP_ROT!" >nul 2>&1

if !CONV_EXIT! neq 0 (
  echo [NG] 変換に失敗しました: !SRC!
  goto :eof
)

REM 出力ファイル候補を順に探す
set "OUT_PATH="
for %%P in (
  "!SRC_DIR!!SRC_NAME!_rotX-90-lod.rad"
  "!SRC_DIR!!SRC_NAME!_rotX-90_lod.rad"
  "!SRC_DIR!!SRC_NAME!_rotX-90.rad"
  "!SRC_DIR!!SRC_NAME!_rotX-90.lod.rad"
  "!SRC_DIR!!SRC_NAME!-lod.rad"
  "!SRC_DIR!!SRC_NAME!_lod.rad"
  "!SRC_DIR!!SRC_NAME!.rad"
  "!SRC_DIR!!SRC_NAME!.lod.rad"
) do (
  if exist "%%~P" if not defined OUT_PATH set "OUT_PATH=%%~P"
)

if not defined OUT_PATH (
  echo [WARN] 変換は実行されましたが、出力 .rad の場所を特定できませんでした。
  echo        以下のフォルダで *.rad を手動で探してください:
  echo        !SRC_DIR!
  goto :eof
)

REM <basename>.rad にリネーム
set "FINAL_PATH=!SRC_DIR!!SRC_NAME!.rad"
if /i not "!OUT_PATH!"=="!FINAL_PATH!" (
  move /Y "!OUT_PATH!" "!FINAL_PATH!" >nul
)

echo [OK] 出力: !FINAL_PATH!
goto :eof
