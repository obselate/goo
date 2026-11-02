# Releasing Goo

```sh
dotnet run --project tools/Goo.Repo -- doctor
dotnet run --project tools/Goo.Repo -- docs
dotnet run --project tools/Goo.Repo -- docs --android
dotnet run --project tools/Goo.Repo -- check metadata
dotnet run --project tools/Goo.Repo -- pack
```

Use annotated `vX.Y.Z` tags from `main`. Do not move or reuse a published tag or
NuGet version.

## Versioning

- Use `PATCH` for compatible fixes and small features.
- Use `MINOR` for substantial feature batches.
- Keep versions below 1.0.0 until the versioning policy changes.
- Use `-name.number` for a prerelease.

## One-time NuGet setup

1. Create a NuGet.org trusted-publishing policy for the package owner.
2. Set owner `obselate`, repository `goo`, workflow `ci.yml`, environment `release`.
3. Set repository variable `NUGET_USER` to the NuGet.org profile name.

## Release steps

1. Update `GooReleaseVersion` in `Directory.Build.props`.
2. Run `dotnet run --project tools/Goo.RepositoryChecks -c Release -- release --write`
   to update templates, identities, protocol strings and integration metadata.
3. Add the dated entry in `CHANGELOG.md`. The tag workflow uses that entry as
   the GitHub Release notes.
4. Run the Goo.Repo commands above. Android docs need the installed Android
   workload, `ANDROID_HOME` and `JAVA_HOME`. Docs commands do not install workloads.
   If Android tooling is unavailable and no Android API changed, use the CI
   Android job's `check docs-android` gate instead of local Android docs generation.
5. Commit generated docs with source changes, as for every PR.
6. Merge the release PR. Require green CI on the exact merge commit.
7. Check the release-candidates and android-package artifacts. Confirm all package,
   clean consumer, template, DevTools, native rebuild and Android payload gates passed.
8. Tag the checked merge commit and push it:

   ```sh
   git tag -a vX.Y.Z <merge-sha> -m "Goo X.Y.Z"
   git push origin vX.Y.Z
   ```

The tag run rebuilds and checks packages, publishes to NuGet.org, and creates
the GitHub Release. Require a green tag run before reporting the release complete.
