package Goo.DevTools.Cli

import System
import System.IO
import System.Linq
import System.Security.Cryptography
import System.Security.Cryptography.X509Certificates
import System.Text.Json

internal shared partial class PackageApplication {
    private const BundleToolHash string = "a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29"

    private async func PackageAndroidAsync(commandLine CommandLine, project string) int32 {
        let bundletool = VerifyTool("GOO_BUNDLETOOL", BundleToolHash)
        let directory = Path.GetDirectoryName(project)!!
        const properties = "TargetFramework,RuntimeIdentifiers,AndroidKeyStore,AndroidSigningKeyStore,AndroidSigningKeyAlias,AndroidSigningKeyPass,AndroidSigningStorePass,ApplicationId,ApplicationVersion"
        let text = await ExecuteAsync(
            "dotnet",
            []string{"msbuild", project, "-nologo", "-p:Configuration=Release", "-getProperty:$properties"},
            directory,
            "invalid-package-metadata",
            capture: true
        )
        using let document = JsonDocument.Parse(text)
        let values = document.RootElement.GetProperty("Properties")
        let Value = func (key string) string {
            return values.GetProperty(key).GetString() ?? ""
        }
        if !Value("TargetFramework").Equals("net10.0-android", StringComparison.Ordinal) || !Value(
            "AndroidKeyStore"
        ).Equals("true", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(
            Value("AndroidSigningKeyAlias")
        ) ||
            !int32.TryParse(Value("ApplicationVersion"), out var appVersion) || appVersion <= 0 {
            throw CliException(
                "Select a net10.0-android application with release signing and a positive ApplicationVersion.",
                "invalid-package-metadata",
                "validation"
            )
        }
        let rids = Value("RuntimeIdentifiers").Split(';', StringSplitOptions.RemoveEmptyEntries)
        if rids.Length == 0 || rids.Any((rid string) -> !((rid == "android-arm64" || rid == "android-x64"))) {
            throw CliException(
                "RuntimeIdentifiers must select android-arm64 and/or android-x64.",
                "unsupported-target",
                "validation"
            )
        }
        let keystore = Path.GetFullPath(Value("AndroidSigningKeyStore"), directory)
        let storePassword = PasswordFile(Value("AndroidSigningStorePass"), directory)
        let _ = PasswordFile(Value("AndroidSigningKeyPass"), directory)
        if !File.Exists(keystore) || Value("ApplicationId").Any(char.IsControl) {
            throw CliException(
                "The upload keystore or ApplicationId is invalid.",
                "invalid-package-metadata",
                "validation"
            )
        }
        let expected = await ExecuteAsync(
            "keytool",
            []string{
                "-exportcert",
                "-rfc",
                "-keystore",
                keystore,
                "-alias",
                Value("AndroidSigningKeyAlias"),
                "-storepass:file",
                storePassword
            },
            directory,
            "signing-failed",
            capture: true
        )
        let output = Path.GetFullPath(commandLine.Get("output") ?? "artifacts/packages", directory)
        let workspace = Path.Combine(directory, "obj", "goo-package", Guid.NewGuid().ToString("N"))
        Directory.CreateDirectory(workspace)
        try {
            let publish = Path.Combine(workspace, "publish")
            await ExecuteAsync(
                "dotnet",
                []string{
                    "publish",
                    project,
                    "-f",
                    "net10.0-android",
                    "-c",
                    "Release",
                    "-m:4",
                    "-p:AndroidPackageFormats=aab",
                    "-p:AndroidKeyStore=true",
                    "-o",
                    publish
                },
                directory,
                "publish-failed"
            )
            let candidates = Directory
                .GetFiles(publish, "*.aab", SearchOption.AllDirectories)
                .Where((path string) -> path.EndsWith("-signed.aab", StringComparison.OrdinalIgnoreCase))
                .ToArray()
            if candidates.Length != 1 {
                throw CliException(
                    "The Android SDK did not create exactly one signed AAB.",
                    "signing-failed",
                    "signing"
                )
            }
            let bundle = candidates[0]
            await ExecuteAsync("jarsigner", []string{"-verify", bundle}, directory, "signing-failed")
            let actual = await ExecuteAsync(
                "keytool",
                []string{"-printcert", "-rfc", "-jarfile", bundle},
                directory,
                "signing-failed",
                capture: true
            )
            using let expectedCertificate = X509Certificate2.CreateFromPem(expected)
            using let actualCertificate = X509Certificate2.CreateFromPem(actual)
            if !actualCertificate
                .RawData
                .AsSpan()
                .SequenceEqual(expectedCertificate.RawData) ||
                actualCertificate
                .Subject
                .Contains("CN=Android Debug", StringComparison.OrdinalIgnoreCase) {
                throw CliException(
                    "The AAB certificate does not match the release upload key.",
                    "signing-failed",
                    "signing"
                )
            }
            await ExecuteAsync(
                "java",
                []string{"-jar", bundletool, "validate", "--bundle=$bundle"},
                directory,
                "package-failed"
            )
            Directory.CreateDirectory(output)
            let artifact = Path.Combine(output, Path.GetFileName(bundle))
            File.Move(bundle, artifact, true)
            if commandLine.Has("json") {
                Console.WriteLine(
                    JsonSerializer.Serialize(
                        AnonymousType3_28CCC6F1744BBBC3("android", "upload-key", []string{artifact})
                    )
                )
            } else {
                Console.WriteLine(artifact)
            }
            return 0
        } catch (CryptographicException) {
            throw CliException("The AAB upload certificate could not be read.", "signing-failed", "signing")
        } finally {
            Directory.Delete(workspace, true)
        }
    }

    private func PasswordFile(value string, directory string) string {
        if !value.StartsWith("file:", StringComparison.Ordinal) {
            throw CliException(
                "AAB signing passwords must use file: references.",
                "invalid-package-metadata",
                "validation"
            )
        }
        let path = Path.GetFullPath(value[5 ..], directory)
        if !File.Exists(path) {
            throw CliException("A signing password file is missing.", "invalid-package-metadata", "validation")
        }
        return path
    }
}

internal data class AnonymousType3_28CCC6F1744BBBC3(target string, signing string, artifacts[]string?) { }
