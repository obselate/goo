@echo off
setlocal
set "ROOT=%~dp0"
set "COMMIT=947be9cb5f4467947ecb95dba06b461f9984d659"
set "GSHARP=%ROOT%artifacts\gsharp"
set "TEMP_ROOT=%TEMP%\goo-bootstrap-%RANDOM%-%RANDOM%"

set "CURRENT="
if exist "%GSHARP%\commit" set /p CURRENT=<"%GSHARP%\commit"
if "%CURRENT%"=="%COMMIT%" if exist "%GSHARP%\compiler\gsc.dll" if exist "%GSHARP%\formatter\gsfmt.dll" goto gsharp_done

git clone -q https://github.com/DavidObando/gsharp.git "%TEMP_ROOT%\gsharp" || goto fail
git -C "%TEMP_ROOT%\gsharp" checkout -q --detach %COMMIT% || goto fail
if exist "%GSHARP%\compiler" rmdir /s /q "%GSHARP%\compiler"
if exist "%GSHARP%\formatter" rmdir /s /q "%GSHARP%\formatter"
dotnet publish "%TEMP_ROOT%\gsharp\src\Compiler\Compiler.csproj" -c Release --nologo -o "%GSHARP%\compiler" || goto fail
dotnet publish "%TEMP_ROOT%\gsharp\src\Formatting\Gsfmt.Cli\Gsfmt.Cli.csproj" -c Release --nologo -o "%GSHARP%\formatter" || goto fail
copy /y "%TEMP_ROOT%\gsharp\LICENSE" "%GSHARP%\LICENSE" >nul || goto fail
>"%GSHARP%\commit" echo %COMMIT%
echo Installed pinned G# authoring tools.
goto after_gsharp

:gsharp_done
echo G# authoring tools are current.

:after_gsharp
if "%~1"=="--gsharp-only" goto done
for /f "tokens=2 delims=>" %%V in ('findstr /c:"<GooReleaseVersion>" "%ROOT%Directory.Build.props"') do set "VERSION=%%V"
for /f "tokens=1 delims=<" %%V in ("%VERSION%") do set "VERSION=%%V"
set "GALLERY=%ROOT%artifacts\gallery-native"
set "CURRENT="
if exist "%GALLERY%\.version" set /p CURRENT=<"%GALLERY%\.version"
if "%CURRENT%"=="%VERSION%" goto gallery_done
mkdir "%TEMP_ROOT%" 2>nul
curl.exe --fail --location --retry 3 "https://github.com/obselate/goo/releases/download/v%VERSION%/Goo.%VERSION%.nupkg" --output "%TEMP_ROOT%\Goo.nupkg" || goto fail
if exist "%GALLERY%" rmdir /s /q "%GALLERY%"
mkdir "%GALLERY%" || goto fail
tar.exe -xf "%TEMP_ROOT%\Goo.nupkg" -C "%GALLERY%" || goto fail
>"%GALLERY%\.version" echo %VERSION%
echo Installed Goo %VERSION% Gallery native assets.
goto done

:gallery_done
echo Gallery native assets are current.

:done
if exist "%TEMP_ROOT%" rmdir /s /q "%TEMP_ROOT%"
exit /b 0

:fail
if exist "%TEMP_ROOT%" rmdir /s /q "%TEMP_ROOT%"
exit /b 1
