param(
    [string]$Box3DSourceDir = "C:\Users\Grayson\OneDrive\Projects - Personal\z-Git\Git-box3d",
    [string]$OutputDir = "$PSScriptRoot\..\..\..\..\public\box3d"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command emcc -ErrorAction SilentlyContinue)) {
    $emsdkEnv = "C:\Users\Grayson\scoop\apps\emscripten\current\emsdk_env.ps1"
    if (Test-Path $emsdkEnv) {
        . $emsdkEnv | Out-Null
    }
}

if (-not (Get-Command emcc -ErrorAction SilentlyContinue)) {
    throw "emcc was not found. Install/activate Emscripten before building the Box3D bridge."
}

if (-not (Test-Path $Box3DSourceDir)) {
    throw "Box3D source directory not found: $Box3DSourceDir"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Remove-Item -LiteralPath "$OutputDir\bridge-manifest.json", "$OutputDir\box3d_bridge.js", "$OutputDir\box3d_bridge.wasm" -ErrorAction SilentlyContinue

$sourceFiles = @("$PSScriptRoot\box3d_bridge.c")
$sourceFiles += Get-ChildItem -Path "$Box3DSourceDir\src" -Filter "*.c" -File | ForEach-Object { $_.FullName }

$exportedFunctions = @(
    "_malloc",
    "_free",
    "_marble_box3d_bridge_version",
    "_marble_box3d_bridge_health",
    "_marble_box3d_world_create",
    "_marble_box3d_world_destroy",
    "_marble_box3d_world_step",
    "_marble_box3d_create_static_box",
    "_marble_box3d_create_dynamic_sphere",
    "_marble_box3d_create_heightfield",
    "_marble_box3d_body_destroy",
    "_marble_box3d_body_apply_torque",
    "_marble_box3d_body_apply_force_to_center",
    "_marble_box3d_body_apply_linear_impulse_to_center",
    "_marble_box3d_body_get_linear_velocity",
    "_marble_box3d_body_set_linear_velocity",
    "_marble_box3d_body_get_angular_velocity",
    "_marble_box3d_body_set_angular_velocity",
    "_marble_box3d_body_set_damping",
    "_marble_box3d_read_body_transform",
    "_marble_box3d_world_raycast",
    "_marble_box3d_body_set_transform"
) | ConvertTo-Json -Compress

& emcc @sourceFiles `
    "-I$Box3DSourceDir\include" `
    "-I$Box3DSourceDir\src" `
    "-std=c17" `
    "-DBOX3D_DISABLE_SIMD" `
    "-D_POSIX_C_SOURCE=200809L" `
    "-O2" `
    "-sMODULARIZE=1" `
    "-sEXPORT_NAME=createMarbleBox3DBridgeModule" `
    "-sENVIRONMENT=web" `
    "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32']" `
    "-sEXPORTED_FUNCTIONS=$exportedFunctions" `
    "-o" "$OutputDir\box3d_bridge.js"

if ($LASTEXITCODE -ne 0) {
    throw "emcc failed with exit code $LASTEXITCODE"
}

$manifest = [ordered]@{
    version = "0.1.0"
    moduleUrl = "/box3d/box3d_bridge.js"
    wasmUrl = "/box3d/box3d_bridge.wasm"
    builtAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    sourceRepo = $Box3DSourceDir
}

$manifest | ConvertTo-Json | Set-Content -Encoding UTF8 "$OutputDir\bridge-manifest.json"

Write-Host "Wrote Box3D bridge artifacts to $OutputDir"


