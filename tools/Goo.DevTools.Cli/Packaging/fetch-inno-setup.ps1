param([Parameter(Mandatory = $true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$installer = Join-Path (Resolve-Path $OutputDirectory) 'innosetup-7.1.0-x64.exe'
if (!(Test-Path $installer)) {
    curl.exe --fail --location --retry 4 --retry-connrefused --retry-max-time 120 --connect-timeout 20 --output $installer 'https://github.com/jrsoftware/issrc/releases/download/is-7_1_0/innosetup-7.1.0-x64.exe'
    if ($LASTEXITCODE -ne 0) { throw 'Inno Setup download failed.' }
}
$expected = '0362a383ed217d4c4239b5933866dd96d3eb2102737da92f80f6057a4b40df2f'
if ((Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Inno Setup download does not match the pinned SHA-256.'
}
Write-Output $installer
