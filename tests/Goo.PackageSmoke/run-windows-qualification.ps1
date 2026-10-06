$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$results = Join-Path $root ("results-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $results | Out-Null
$executable = Join-Path $root "Goo.PackageSmoke.exe"
if (-not (Test-Path $executable)) {
    throw "Goo.PackageSmoke.exe is missing"
}

$video = Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, VideoProcessor
$processor = Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors
$computer = Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory, Manufacturer, Model
$system = [ordered]@{
    schema = 1
    capturedUtc = (Get-Date).ToUniversalTime().ToString("o")
    os = [System.Environment]::OSVersion.VersionString
    processArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
    executableSha256 = (Get-FileHash $executable -Algorithm SHA256).Hash.ToLowerInvariant()
    processor = $processor
    computer = $computer
    video = $video
}
$system | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $results "system.json")

$lanes = @(
    [ordered]@{ name = "benchmark"; variable = "GOO_WINDOWS_QUALIFICATION" },
    [ordered]@{ name = "primitive"; variable = "GOO_PRIMITIVE_SMOKE" },
    [ordered]@{ name = "window"; variable = "GOO_WINDOW_SMOKE" },
    [ordered]@{ name = "multi-window"; variable = "GOO_MULTI_WINDOW_SMOKE" },
    [ordered]@{ name = "native-backdrop"; variable = "GOO_NATIVE_BACKDROP_SMOKE" }
)
$summary = @()
foreach ($lane in $lanes) {
    Remove-Item Env:GOO_WINDOWS_QUALIFICATION, Env:GOO_PRIMITIVE_SMOKE, Env:GOO_WINDOW_SMOKE, Env:GOO_MULTI_WINDOW_SMOKE, Env:GOO_NATIVE_BACKDROP_SMOKE -ErrorAction SilentlyContinue
    Set-Item ("Env:" + $lane.variable) "1"
    $env:GOO_VK_DIAGNOSTICS = "1"
    $stdout = Join-Path $results ($lane.name + ".stdout.txt")
    $stderr = Join-Path $results ($lane.name + ".stderr.ndjson")
    $started = [System.Diagnostics.Stopwatch]::StartNew()
    $process = Start-Process -FilePath $executable -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $exitCode = $process.ExitCode
    $started.Stop()
    $summary += [ordered]@{
        name = $lane.name
        exitCode = $exitCode
        elapsedMilliseconds = $started.ElapsedMilliseconds
        stdout = [System.IO.Path]::GetFileName($stdout)
        stderr = [System.IO.Path]::GetFileName($stderr)
    }
    if ($exitCode -ne 0) {
        break
    }
}
Remove-Item Env:GOO_WINDOWS_QUALIFICATION, Env:GOO_PRIMITIVE_SMOKE, Env:GOO_WINDOW_SMOKE, Env:GOO_MULTI_WINDOW_SMOKE, Env:GOO_NATIVE_BACKDROP_SMOKE, Env:GOO_VK_DIAGNOSTICS -ErrorAction SilentlyContinue
$summary | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $results "summary.json")
$failed = @($summary | Where-Object { $_.exitCode -ne 0 })
Write-Host ("Results: " + $results)
if ($failed.Count -ne 0) {
    exit 1
}
