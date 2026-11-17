using module './GooLog/GooLog.psd1'

param([Parameter(ValueFromRemainingArguments)][string[]] $Arguments)
$ErrorActionPreference = 'Stop'
if ($Arguments.Count -gt 0 -and ($Arguments.Count -ne 1 -or $Arguments[0] -ne '--check')) { throw 'Usage: Start.ps1 [--check]' }
if ($Arguments -contains '--check') { Test-GooLog } else { Show-GooLog }