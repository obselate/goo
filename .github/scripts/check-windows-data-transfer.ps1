param(
    [Parameter(Mandatory = $true)][string]$Application,
    [Parameter(Mandatory = $true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$applicationPath = (Resolve-Path $Application).Path
$root = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($root) | Out-Null
$peer = Join-Path $root 'windows-data-transfer-peer.exe'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../tests/NativeWindow/windows_data_transfer_peer.cpp'))
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vcvars = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find 'VC/Auxiliary/Build/vcvars64.bat'
if (!$vcvars) { throw 'The Visual C++ toolchain is missing' }
& cmd.exe /d /s /c "`"`"$vcvars`" && cl /nologo /std:c++17 /EHsc /W4 /WX /MT /DUNICODE /D_UNICODE /D_WIN32_WINNT=0x0A00 /Fo`"$root/peer.obj`" /Fe`"$peer`" `"$source`" ole32.lib shell32.lib user32.lib uuid.lib`""
if ($LASTEXITCODE -ne 0) { throw 'The native transfer peer did not compile' }
$png = Join-Path (Split-Path $applicationPath) 'local-rgba.png'
if (!(Test-Path $png)) { throw 'The native PNG fixture is missing' }

function Start-Fixture([string]$executable, [string[]]$arguments, [string]$prefix) {
    $start = @{ FilePath = $executable; RedirectStandardOutput = "$prefix.stdout"; RedirectStandardError = "$prefix.stderr"; PassThru = $true }
    if ($arguments.Count) { $start.ArgumentList = @($arguments | ForEach-Object { '"' + $_ + '"' }) }
    $process = Start-Process @start
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ((Test-Path "$prefix.stdout") -and [IO.File]::ReadAllText("$prefix.stdout").Contains('ready')) { return $process }
        if ($process.HasExited) { throw "Fixture exited before ready: $prefix`n$([IO.File]::ReadAllText("$prefix.stderr"))" }
        Start-Sleep -Milliseconds 50
    }
    $process.Kill()
    throw "Fixture did not become ready: $prefix"
}

$cases = @(
    @{ Name = 'out-copy'; Role = 'source'; Effect = 1; Kind = 'mime' },
    @{ Name = 'out-move'; Role = 'source'; Effect = 2; Kind = 'mime' },
    @{ Name = 'in-copy'; Role = 'target'; Effect = 1; Kind = 'mime' },
    @{ Name = 'in-move'; Role = 'target'; Effect = 2; Kind = 'mime' },
    @{ Name = 'final-reject'; Role = 'target'; Effect = 2; Kind = 'mime'; Reject = $true },
    @{ Name = 'source-close'; Role = 'source'; Effect = 1; Kind = 'mime'; Cancel = $true },
    @{ Name = 'legacy-files'; Role = 'target'; Effect = 1; Kind = 'legacy' },
    @{ Name = 'in-files-copy'; Role = 'target'; Effect = 1; Kind = 'files' },
    @{ Name = 'in-files-move'; Role = 'target'; Effect = 2; Kind = 'files' },
    @{ Name = 'out-files-copy'; Role = 'source'; Effect = 1; Kind = 'files' },
    @{ Name = 'out-files-move'; Role = 'source'; Effect = 2; Kind = 'files' },
    @{ Name = 'optimized-file-move'; Role = 'source'; Effect = 2; Kind = 'optimized' }
)
foreach ($case in $cases) {
    $directory = Join-Path $root $case.Name
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    0..1 | ForEach-Object { [IO.File]::WriteAllText((Join-Path $directory "source-$_.txt"), "native file $_", [Text.UTF8Encoding]::new($false)) }
    $gooTitle = "goo-transfer-$PID-$($case.Name)"
    $peerTitle = "native-transfer-$PID-$($case.Name)"
    $env:GOO_NATIVE_TRANSFER_SMOKE = '1'
    $env:GOO_TRANSFER_TITLE = $gooTitle
    $env:GOO_TRANSFER_DIRECTORY = $directory
    $env:GOO_TRANSFER_ROLE = $case.Role
    $env:GOO_TRANSFER_EFFECT = [string]$case.Effect
    $env:GOO_TRANSFER_KIND = $case.Kind
    $env:GOO_TRANSFER_REJECT = if ($case.Reject) { '1' } else { '0' }
    $env:GOO_TRANSFER_CANCEL = if ($case.Cancel) { '1' } else { '0' }
    $goo = $null
    $native = $null
    try {
        $goo = Start-Fixture $applicationPath @() (Join-Path $directory 'goo')
        $peerRole = if ($case.Role -eq 'source') { 'target' } else { 'source' }
        $peerKind = if ($case.Kind -eq 'legacy') { 'files' } else { $case.Kind }
        $native = Start-Fixture $peer @($peerRole, $peerTitle, [string]$case.Effect, $peerKind, $directory, $png) (Join-Path $directory 'peer')
        $sourceTitle = if ($case.Role -eq 'source') { $gooTitle } else { $peerTitle }
        $targetTitle = if ($case.Role -eq 'source') { $peerTitle } else { $gooTitle }
        $hold = if ($case.Cancel) { '1200' } else { '250' }
        & $peer input $sourceTitle $targetTitle $hold | Out-File (Join-Path $directory 'input.stdout')
        if ($LASTEXITCODE -ne 0) { throw 'Native gesture input failed' }
        if ($case.Reject) {
            if (!$native.WaitForExit(15000)) { throw 'Rejected source did not finish' }
            & $peer close $gooTitle
            if ($LASTEXITCODE -ne 0) { throw 'Cannot close rejected target' }
        }
        if ($case.Cancel) {
            & $peer close $peerTitle
            if ($LASTEXITCODE -ne 0) { throw 'Cannot close unused target' }
        }
        if (!$goo.WaitForExit(15000) -or !$native.WaitForExit(15000)) { throw 'Native transfer processes did not finish' }
        if ($goo.ExitCode -ne 0 -or $native.ExitCode -ne 0) { throw 'Native transfer process failed' }
        $gooOutput = [IO.File]::ReadAllText((Join-Path $directory 'goo.stdout'))
        $nativeOutput = [IO.File]::ReadAllText((Join-Path $directory 'peer.stdout'))
        if (!$gooOutput.Contains('transfer-pass')) { throw 'Goo transfer result is missing' }
        if ($case.Role -eq 'target') {
            $expected = if ($case.Reject) { 'source-end 1 0 0' } else { "source-end 0 $($case.Effect) " }
            if (!$nativeOutput.Contains($expected)) { throw "Native source result changed: $nativeOutput" }
        } elseif (!$case.Cancel -and !$nativeOutput.Contains("drop-complete $($case.Effect)")) {
            throw 'Native target result is missing'
        }
        Write-Output "native-transfer: $($case.Name) passed"
    } catch {
        Get-ChildItem $directory -Filter '*.stdout' | ForEach-Object { Write-Output $_.Name; Get-Content $_.FullName }
        Get-ChildItem $directory -Filter '*.stderr' | ForEach-Object { Write-Output $_.Name; Get-Content $_.FullName }
        throw
    } finally {
        foreach ($process in @($goo, $native)) {
            if ($process -and !$process.HasExited) { $process.Kill(); $process.WaitForExit() }
            if ($process) { $process.Dispose() }
        }
    }
}
