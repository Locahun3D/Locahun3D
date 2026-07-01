#!/usr/bin/env bash
# ============================================================
#  PLY -> RAD 変換 (macOS / Linux)
# ============================================================
#  使い方:
#    ./convert.sh path/to/file1.ply            # 個別変換
#    ./convert.sh file1.ply file2.ply file3.ply # 複数→選択
#    ./convert.sh --merge file1.ply file2.ply   # マージ変換
#
#  出力 .rad は入力と同じフォルダに <basename>.rad で保存されます。
#  マージ変換時は最初のファイル名に _merged を付けて出力します。
# ============================================================

set -e
cd "$(dirname "$0")"

# cargo bin が PATH に無いシェルから実行されたケースの保険
if [ -x "$HOME/.cargo/bin/cargo" ] && ! command -v cargo >/dev/null 2>&1; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi

# ── Spark セットアップ確認 ──
if [ ! -d "spark/node_modules" ]; then
  echo
  echo "[NG] Spark のセットアップが完了していません。"
  echo "     まず ./setup.sh を実行してください。"
  echo
  exit 1
fi

# ── 引数チェック ──
if [ $# -eq 0 ]; then
  cat <<EOF

============================================================
  PLY -> RAD 変換
============================================================

  使い方:
    ./convert.sh path/to/file.ply                 # 個別変換
    ./convert.sh file1.ply file2.ply file3.ply     # 複数→選択
    ./convert.sh --merge file1.ply file2.ply       # マージ変換

  出力 .rad は入力と同じフォルダに保存されます。

EOF
  exit 0
fi

# ── --merge フラグ検出 ──
FORCE_MERGE=0
if [ "$1" = "--merge" ]; then
  FORCE_MERGE=1
  shift
fi

# ── ファイルリスト収集 ──
FILES=()
for arg in "$@"; do
  FILES+=("$arg")
done

# ── 1 ファイル変換関数（従来動作） ──
convert_one() {
  local src="$1"

  if [ ! -f "$src" ]; then
    echo "[NG] ファイルが見つかりません: $src"
    return
  fi

  local src_abs
  if [[ "$src" = /* ]]; then
    src_abs="$src"
  else
    src_abs="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
  fi

  local src_dir
  src_dir="$(dirname "$src_abs")"
  local base
  base="$(basename "$src_abs")"
  local name="${base%.*}"
  local ext="${base##*.}"
  ext="${ext,,}"

  echo
  echo "------------------------------------------------------------"
  echo "  入力: $src_abs"
  echo "------------------------------------------------------------"

  local build_src="$src_abs"
  local tmp_rot=""
  if [ "$ext" = "ply" ]; then
    tmp_rot="${src_dir}/${name}_rotX-90.ply"
    echo "[INFO] PLY を -90 度 X 回転中..."
    local self_dir
    self_dir="$(cd "$(dirname "$0")" && pwd)"
    if ! node "${self_dir}/rotate_ply.js" "$src_abs" "$tmp_rot"; then
      echo "[NG] 回転処理に失敗しました"
      [ -f "$tmp_rot" ] && rm -f "$tmp_rot"
      return
    fi
    build_src="$tmp_rot"
  fi

  (
    cd spark
    npm run build-lod -- "$build_src" --quality
  )
  local conv_exit=$?

  [ -n "$tmp_rot" ] && [ -f "$tmp_rot" ] && rm -f "$tmp_rot"

  if [ "$conv_exit" -ne 0 ]; then
    echo "[NG] 変換に失敗しました: $src_abs"
    return
  fi

  local out=""
  for candidate in \
    "${src_dir}/${name}_rotX-90-lod.rad" \
    "${src_dir}/${name}_rotX-90_lod.rad" \
    "${src_dir}/${name}_rotX-90.lod.rad" \
    "${src_dir}/${name}_rotX-90.rad" \
    "${src_dir}/${name}-lod.rad" \
    "${src_dir}/${name}_lod.rad" \
    "${src_dir}/${name}.lod.rad" \
    "${src_dir}/${name}.rad"; do
    if [ -f "$candidate" ]; then
      out="$candidate"
      break
    fi
  done

  if [ -z "$out" ]; then
    echo "[WARN] 変換は実行されましたが、出力 .rad の場所を特定できませんでした。"
    echo "       以下のフォルダで *.rad を手動で探してください:"
    echo "       $src_dir"
    return
  fi

  local final="${src_dir}/${name}.rad"
  if [ "$out" != "$final" ]; then
    mv -f "$out" "$final"
  fi
  echo "[OK] 出力: $final"
}

# ── マージ変換関数 ──
convert_merge() {
  local self_dir
  self_dir="$(cd "$(dirname "$0")" && pwd)"

  # PLY とそれ以外を分離
  local ply_files=()
  local other_files=()
  for f in "${FILES[@]}"; do
    local ext="${f##*.}"
    ext="${ext,,}"
    if [ "$ext" = "ply" ]; then
      ply_files+=("$f")
    else
      other_files+=("$f")
    fi
  done

  if [ ${#other_files[@]} -gt 0 ]; then
    echo
    echo "[WARN] PLY 以外のファイルが ${#other_files[@]} 件含まれています。"
    echo "       マージ変換は PLY ファイルのみ対応です。"
    echo "       PLY 以外は個別変換にフォールバックします。"
  fi

  if [ ${#ply_files[@]} -lt 2 ]; then
    echo "[INFO] マージ対象の PLY が 1 件以下のため、個別変換を実行します。"
    for f in "${FILES[@]}"; do
      convert_one "$f"
    done
    return
  fi

  # Step 1: 各 PLY を回転
  echo
  echo "[STEP 1/3] PLY を -90° X 軸回転中..."
  local rot_files=()
  local cleanup_files=()
  for f in "${ply_files[@]}"; do
    local abs_f
    if [[ "$f" = /* ]]; then abs_f="$f"; else abs_f="$(cd "$(dirname "$f")" && pwd)/$(basename "$f")"; fi
    local dir="$(dirname "$abs_f")"
    local name="$(basename "$abs_f" .ply)"
    local rot_path="${dir}/${name}_rotX-90.ply"

    echo "  回転中: $abs_f"
    if ! node "${self_dir}/rotate_ply.js" "$abs_f" "$rot_path"; then
      echo "[NG] 回転処理に失敗しました: $abs_f"
      # 掃除して終了
      for cf in "${cleanup_files[@]}"; do [ -f "$cf" ] && rm -f "$cf"; done
      return
    fi
    rot_files+=("$rot_path")
    cleanup_files+=("$rot_path")
  done

  # Step 2: マージ
  echo
  echo "[STEP 2/3] ${#rot_files[@]} ファイルをマージ中..."

  local first_abs
  if [[ "${ply_files[0]}" = /* ]]; then first_abs="${ply_files[0]}"; else first_abs="$(cd "$(dirname "${ply_files[0]}")" && pwd)/$(basename "${ply_files[0]}")"; fi
  local merge_dir="$(dirname "$first_abs")"
  local merge_base="$(basename "$first_abs" .ply)"
  local merged_ply="${merge_dir}/${merge_base}_merged.ply"

  if ! node "${self_dir}/merge_ply.js" "$merged_ply" "${rot_files[@]}"; then
    echo "[NG] マージに失敗しました"
    for cf in "${cleanup_files[@]}"; do [ -f "$cf" ] && rm -f "$cf"; done
    return
  fi
  cleanup_files+=("$merged_ply")

  # Step 3: build-lod
  echo
  echo "[STEP 3/3] マージ済み PLY を RAD に変換中..."
  (
    cd spark
    npm run build-lod -- "$merged_ply" --quality
  )
  local conv_exit=$?

  if [ "$conv_exit" -ne 0 ]; then
    echo "[NG] RAD 変換に失敗しました"
    for cf in "${cleanup_files[@]}"; do [ -f "$cf" ] && rm -f "$cf"; done
    return
  fi

  # 出力ファイル検索
  local out=""
  for candidate in \
    "${merge_dir}/${merge_base}_merged-lod.rad" \
    "${merge_dir}/${merge_base}_merged_lod.rad" \
    "${merge_dir}/${merge_base}_merged.lod.rad" \
    "${merge_dir}/${merge_base}_merged.rad"; do
    if [ -f "$candidate" ]; then
      out="$candidate"
      break
    fi
  done

  # 掃除
  for cf in "${cleanup_files[@]}"; do [ -f "$cf" ] && rm -f "$cf"; done

  if [ -z "$out" ]; then
    echo "[WARN] 変換は実行されましたが、出力 .rad の場所を特定できませんでした。"
    echo "       以下のフォルダで *.rad を手動で探してください:"
    echo "       $merge_dir"
    return
  fi

  local final_rad="${merge_dir}/${merge_base}_merged.rad"
  if [ "$out" != "$final_rad" ]; then
    mv -f "$out" "$final_rad"
  fi

  echo
  echo "[OK] マージ変換完了: $final_rad"

  # PLY 以外のファイルがあれば個別変換
  for f in "${other_files[@]}"; do
    convert_one "$f"
  done
}

# ── メイン処理 ──
echo
echo "============================================================"
echo "  PLY -> RAD 変換  （${#FILES[@]} ファイル検出）"
echo "============================================================"

if [ ${#FILES[@]} -eq 1 ]; then
  convert_one "${FILES[0]}"
elif [ "$FORCE_MERGE" -eq 1 ]; then
  echo "  --merge 指定: マージ変換モード"
  convert_merge
else
  echo
  echo "  [1] 個別変換  — 各ファイルごとに .rad を生成"
  echo "  [2] マージ変換 — 全ファイルを統合して 1 つの .rad を生成"
  echo
  read -rp "  番号を入力 (1 or 2): " MODE
  case "$MODE" in
    1)
      echo
      echo "  個別変換モード"
      for f in "${FILES[@]}"; do
        convert_one "$f"
      done
      ;;
    2)
      convert_merge
      ;;
    *)
      echo "  [NG] 1 か 2 を入力してください。"
      exit 1
      ;;
  esac
fi

echo
echo "============================================================"
echo "  全ファイルの変換が完了しました。"
echo "============================================================"
echo
