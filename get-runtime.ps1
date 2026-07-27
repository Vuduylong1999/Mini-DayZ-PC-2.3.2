<#
    Tải & cài NW.js runtime cho MDZ 2.3.2 PC
    ==========================================
    Repo git chỉ chứa phần game (~40 MB). Toàn bộ runtime NW.js (~400 MB giải nén:
    nw.dll, locales/, pnacl/, swiftshader/, vulkan-1.dll, vk_swiftshader.dll,
    node.dll, *.pak, *.exe ...) bị .gitignore bỏ qua vì nặng và tải lại được.

    Chạy script này 1 lần sau khi clone về máy mới:

        cd "<thư mục game>"
        powershell -ExecutionPolicy Bypass -File .\get-runtime.ps1

    Nó sẽ tải nwjs-sdk-v0.81.0-win-x64.zip (164 MB) về cache\, giải nén và copy
    vào thư mục game, đổi nw.exe thành MiniDayZ-2.3.2.exe.

    Bản SDK (không phải bản "normal") vì F9 trong game gọi nw.Window.showDevTools()
    - chỉ bản SDK mới có DevTools.

    Có sẵn file zip rồi thì bỏ vào cache\ trước khi chạy, script sẽ dùng lại.
#>

$ErrorActionPreference = "Stop"

$VER   = "v0.81.0"
$PKG   = "nwjs-sdk-$VER-win-x64"
$URL   = "https://dl.nwjs.io/$VER/$PKG.zip"
$EXE   = "MiniDayZ-2.3.2.exe"

$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$cache = Join-Path $here "cache"
$zip   = Join-Path $cache "$PKG.zip"
$tmp   = Join-Path $cache "_extract"

if (-not (Test-Path (Join-Path $here "index.html"))) {
    throw "Không thấy index.html - chạy script này TRONG thư mục game."
}
New-Item -ItemType Directory $cache -Force | Out-Null

# ---- 1. Tải (bỏ qua nếu đã có file zip hợp lệ) ----
$needDownload = $true
if (Test-Path $zip) {
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $z = [IO.Compression.ZipFile]::OpenRead($zip); $n = $z.Entries.Count; $z.Dispose()
        if ($n -gt 100) { Write-Host "Dùng lại zip có sẵn: $zip ($n file)"; $needDownload = $false }
        else { Write-Host "Zip trong cache hỏng/thiếu -> tải lại." }
    } catch { Write-Host "Zip trong cache hỏng -> tải lại." }
}
if ($needDownload) {
    Write-Host "Đang tải $URL (164 MB), chờ tí..."
    $pp = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $URL -OutFile $zip -TimeoutSec 1800 -UseBasicParsing
    $ProgressPreference = $pp
    Write-Host ("Tải xong: {0:N1} MB" -f ((Get-Item $zip).Length / 1MB))
}

# ---- 2. Giải nén ----
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Write-Host "Đang giải nén..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
$src = Join-Path $tmp $PKG
if (-not (Test-Path $src)) { $src = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName }

# ---- 3. Copy vào thư mục game ----
Write-Host "Đang copy runtime vào $here ..."
Get-ChildItem $src -Force | ForEach-Object {
    $dest = Join-Path $here $_.Name
    if ($_.Name -eq "nw.exe") { $dest = Join-Path $here $EXE }
    if ($_.PSIsContainer) {
        robocopy $_.FullName $dest /E /NFL /NDL /NJH /NJS /NP | Out-Null
    } else {
        Copy-Item $_.FullName $dest -Force
    }
}
Remove-Item $tmp -Recurse -Force

# ---- 4. Kiểm tra ----
$must = @($EXE, "nw.dll", "node.dll", "icudtl.dat", "resources.pak",
          "v8_context_snapshot.bin", "vulkan-1.dll", "vk_swiftshader.dll",
          "vk_swiftshader_icd.json", "locales", "swiftshader", "pnacl")
$missing = $must | Where-Object { -not (Test-Path (Join-Path $here $_)) }
if ($missing) { throw "THIẾU sau khi cài: $($missing -join ', ')" }

Write-Host ""
Write-Host "XONG. Chạy $EXE để chơi." -ForegroundColor Green
Write-Host "(exe sẽ dùng icon mặc định của NW.js thay vì icon game - chỉ khác về thẩm mỹ,"
Write-Host " icon cửa sổ trong game vẫn lấy từ icon-256.png qua package.json.)"
