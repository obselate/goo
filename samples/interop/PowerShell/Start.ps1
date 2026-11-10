param([Parameter(ValueFromRemainingArguments)][string[]] $Arguments)
$ErrorActionPreference = 'Stop'
if ($Arguments.Count -gt 0 -and ($Arguments.Count -ne 1 -or $Arguments[0] -ne '--check')) { throw 'Usage: Start.ps1 [--check]' }
$bin = Join-Path $PSScriptRoot 'bin/Release/net10.0'
foreach ($name in 'HexaGen.Runtime', 'Goo') { $null = [Reflection.Assembly]::LoadFrom("$bin/$name.dll") }
. "$PSScriptRoot/Counter.ps1"
$counter = [Counter]::new()
if ($Arguments -contains '--check') {
    $tree = [Goo.Container]$counter.Build()
    $button = [Goo.Button]$tree.Children[1]
    if ($tree.Children[0].Content -ne 'Count: 0') { throw 'Initial count differs' }
    $button.OnClick.Invoke()
    $tree = [Goo.Container]$counter.Build()
    if ($tree.Children[0].Content -ne 'Count: 1') { throw 'Counter callback failed' }
    if ($button.KeyBindings.Length -ne 2 -or $null -eq $button.KeyBindings[1].OnRelease) { throw 'Keyboard bindings differ' }
    'PowerShell interop --check passed'
    return
}
$window = [Goo.Window]@{ Title = 'PowerShell interop'; Width = 400; Height = 240; Root = $counter }
$window.Run()
