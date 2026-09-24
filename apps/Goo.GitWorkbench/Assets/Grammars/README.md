# Bundled grammars

Only the G# and C# grammars are bundled. The app uses TextMateSharp 2.0.4 core and its Onigwrap dependency, without the full grammar or theme package.

- `gsharp.tmLanguage.json`: [gsharp](https://github.com/DavidObando/gsharp), `src/vscode-gsharp/syntaxes/gsharp.tmLanguage.json`, copied from local commit `6e1eecc7274af0300e307bd0cc4e3528f78175f8`. MIT notice: `GSharp-LICENSE`.
- `csharp.tmLanguage.json`: [TextMateSharp](https://github.com/danipen/TextMateSharp/tree/622d1b240a5be474939857c0b2780249022f14a3/src/TextMateSharp.Grammars/Resources/Grammars/csharp/syntaxes), version 2.0.4. This JSON identifies [dotnet/csharp-tmLanguage commit 7a7482f](https://github.com/dotnet/csharp-tmLanguage/commit/7a7482ffc72a6677a87eb1ed76005593a4f7f131) as its source version. MIT notice: `CSharp-LICENSE`.
