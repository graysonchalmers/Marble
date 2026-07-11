#!/usr/bin/env bash
# build-box3d-bridge.sh — Linux/cloud counterpart to build-box3d-bridge.ps1.
#
# Rebuilds the Box3D WASM bridge (box3d_bridge.js + .wasm) entirely in a Linux
# environment (e.g. a Cowork cloud container) using emscripten — NO Windows host
# required. VALIDATED 2026-07-11 (session 20): a bridge built this way passed the
# full Box3DWorldIntegration suite (F1 catch = 1.767s, identical to the host build;
# F9 determinism, replay, and crumble-smash tests all green), so the output is
# behavior-equivalent to the PowerShell/host build.
#
# This removes the "needs Grayson's Windows host + emcc" blocker that gated every
# collider-primitive change (Known #7, tilted colliders, round columns, real
# voxel-crumble): the C bridge can now be edited AND compiled AND verified end-to-end
# in one cloud session.
#
# Prereqs (one-time in the container):
#   git clone https://github.com/emscripten-core/emsdk.git /tmp/emsdk
#   /tmp/emsdk/emsdk install latest && /tmp/emsdk/emsdk activate latest
#   source /tmp/emsdk/emsdk_env.sh
#
# Usage:
#   bash build-box3d-bridge.sh                 # clones box3d at the pinned commit into /tmp
#   BOX3D_SRC=/path/to/box3d bash build-box3d-bridge.sh   # use an existing checkout
#
# After building, verify BEFORE trusting the output:
#   (swap the artifacts into public/box3d/ and) npx vitest run \
#     src/physics/box3d/Box3DWorldIntegration.test.ts src/physics/box3d/box3dBridge.test.ts
#   F1 should still catch at ~1.767s and all tests must pass — that's the equivalence gate.

set -euo pipefail

# Box3D upstream (erincatto/box3d). PINNED for reproducibility — this is the commit
# session 20 validated against. Bump deliberately + re-run the equivalence gate above.
BOX3D_REPO="https://github.com/erincatto/box3d.git"
BOX3D_COMMIT="aaa795e34f64035b5e827665a8a8f0e74f1282d3"   # 2026-07-10 "Edge edge optimization (#63)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${OUTPUT_DIR:-$SCRIPT_DIR/../../../../public/box3d}"

command -v emcc >/dev/null 2>&1 || { echo "ERROR: emcc not on PATH — source your emsdk_env.sh first (see header)." >&2; exit 1; }

# Resolve the Box3D source: use $BOX3D_SRC if given, else clone the pinned commit.
if [[ -n "${BOX3D_SRC:-}" ]]; then
    BOX3D="$BOX3D_SRC"
else
    BOX3D="${BOX3D_CLONE_DIR:-/tmp/box3d}"
    if [[ ! -d "$BOX3D/include/box3d" ]]; then
        echo "Cloning Box3D @ $BOX3D_COMMIT ..."
        git clone "$BOX3D_REPO" "$BOX3D"
        git -C "$BOX3D" checkout "$BOX3D_COMMIT"
    fi
fi
[[ -f "$BOX3D/include/box3d/box3d.h" ]] || { echo "ERROR: Box3D headers not found under $BOX3D/include." >&2; exit 1; }

# Exported C ABI — MUST stay in sync with build-box3d-bridge.ps1's $exportedFunctions.
EXPORTS='["_malloc","_free","_marble_box3d_bridge_version","_marble_box3d_bridge_health","_marble_box3d_world_create","_marble_box3d_world_destroy","_marble_box3d_world_step","_marble_box3d_create_static_box","_marble_box3d_create_dynamic_sphere","_marble_box3d_create_dynamic_box","_marble_box3d_create_heightfield","_marble_box3d_body_destroy","_marble_box3d_body_apply_torque","_marble_box3d_body_apply_force_to_center","_marble_box3d_body_apply_linear_impulse_to_center","_marble_box3d_body_get_linear_velocity","_marble_box3d_body_set_linear_velocity","_marble_box3d_body_get_angular_velocity","_marble_box3d_body_set_angular_velocity","_marble_box3d_body_set_damping","_marble_box3d_read_body_transform","_marble_box3d_world_raycast","_marble_box3d_body_set_transform"]'

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/bridge-manifest.json" "$OUT_DIR/box3d_bridge.js" "$OUT_DIR/box3d_bridge.wasm"

echo "Compiling bridge + $(ls "$BOX3D"/src/*.c | wc -l) box3d source files ..."
emcc "$SCRIPT_DIR/box3d_bridge.c" "$BOX3D"/src/*.c \
    "-I$BOX3D/include" "-I$BOX3D/src" \
    -std=c17 -DBOX3D_DISABLE_SIMD -D_POSIX_C_SOURCE=200809L -O2 \
    -sMODULARIZE=1 -sEXPORT_NAME=createMarbleBox3DBridgeModule -sENVIRONMENT=web \
    "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32']" \
    "-sEXPORTED_FUNCTIONS=$EXPORTS" \
    -sALLOW_MEMORY_GROWTH=1 \
    -o "$OUT_DIR/box3d_bridge.js"

# Manifest (matches the PS script's shape). No Date.now() gymnastics needed here.
cat > "$OUT_DIR/bridge-manifest.json" <<EOF
{
    "version": "0.1.0",
    "moduleUrl": "/box3d/box3d_bridge.js",
    "wasmUrl": "/box3d/box3d_bridge.wasm",
    "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "sourceRepo": "$BOX3D_REPO@$BOX3D_COMMIT"
}
EOF

echo "Wrote Box3D bridge artifacts to $OUT_DIR"
echo "⚠️  VERIFY before trusting: run the Box3DWorldIntegration suite (F1 ~1.767s + all green) — see header."
