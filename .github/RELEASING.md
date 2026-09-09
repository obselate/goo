# Releasing Goo

Goo releases use annotated `vX.Y.Z` tags from `main`.

## Versioning

Goo uses Semantic Versioning.

- Increase `MAJOR` for an incompatible public change after 1.0.0.
- Increase `MINOR` for a compatible feature or an incompatible 0.x change.
- Increase `PATCH` for a compatible fix.
- Use `-name.number` for a prerelease.

## One-time NuGet setup

1. Create a NuGet.org trusted-publishing policy for the package owner.
2. Set repository owner `obselate`, repository `goo`, workflow `ci.yml`, and environment `release`.
3. Set the GitHub repository variable `NUGET_USER` to the NuGet.org profile name.

## Release

1. Update `GooReleaseVersion` once in `Directory.Build.props`.
2. Run `python3 .github/scripts/release_version.py --write` to synchronize the
   application template, app identities, protocol strings, install commands,
   and integration metadata.
3. Add the dated release entry to `CHANGELOG.md`. Build Goo in Release mode,
   regenerate API documentation with `dotnet run --project tools/Goo.ApiDocs/Goo.ApiDocs.csproj -c Release`,
   and refresh the plugin reference with `python3 plugins/goo/scripts/sync_docs.py "$PWD"`.
   Run `.github/scripts/validate-onboarding.py`.
4. Push the release commit to `main` and require a green CI run.
5. Confirm that the release-candidates artifact contains all six packages,
   the Linux and macOS arm64 bundles, and that the clean template and DevTools
   installation steps passed.
6. Create and push the annotated tag: `git tag -a vX.Y.Z -m "Goo X.Y.Z"`.
7. The tag run rebuilds and validates the packages, publishes them to
   NuGet.org, and creates the GitHub Release.

Do not move or reuse a published tag or NuGet version.
