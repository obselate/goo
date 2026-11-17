@{
    RootModule = 'GooLog.psm1'
    ModuleVersion = '1.0.0'
    GUID = 'c45cc603-c7ee-4c96-b3cf-cba1027628b0'
    Author = 'Goo contributors'
    PowerShellVersion = '7.6'
    RequiredAssemblies = @('lib/HexaGen.Runtime.dll', 'lib/Goo.dll', 'lib/Goo.Widgets.dll')
    FunctionsToExport = @('Show-GooLog', 'Test-GooLog')
    CmdletsToExport = @()
    VariablesToExport = @()
    AliasesToExport = @()
}
