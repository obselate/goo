using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;

namespace Goo.DevTools.Cli;

internal static partial class PackageApplication
{
    private const string BundleToolHash = "a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29";

    private static async Task<int> PackageAndroidAsync(CommandLine commandLine, string project)
    {
        var bundletool = VerifyTool("GOO_BUNDLETOOL", BundleToolHash);
        var directory = Path.GetDirectoryName(project)!;
        const string properties = "TargetFramework,RuntimeIdentifiers,AndroidKeyStore,AndroidSigningKeyStore,AndroidSigningKeyAlias,AndroidSigningKeyPass,AndroidSigningStorePass,ApplicationId,ApplicationVersion";
        var text = await ExecuteAsync("dotnet", ["msbuild", project, "-nologo", "-p:Configuration=Release",
            $"-getProperty:{properties}"], directory, "invalid-package-metadata", capture: true);
        using var document = JsonDocument.Parse(text);
        var values = document.RootElement.GetProperty("Properties");
        string Value(string key) => values.GetProperty(key).GetString() ?? "";
        if (!Value("TargetFramework").Equals("net10.0-android", StringComparison.Ordinal)
            || !Value("AndroidKeyStore").Equals("true", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(Value("AndroidSigningKeyAlias"))
            || !int.TryParse(Value("ApplicationVersion"), out var appVersion) || appVersion <= 0)
            throw new CliException("Select a net10.0-android application with release signing and a positive ApplicationVersion.",
                "invalid-package-metadata", "validation");
        var rids = Value("RuntimeIdentifiers").Split(';', StringSplitOptions.RemoveEmptyEntries);
        if (rids.Length == 0 || rids.Any(rid => rid is not ("android-arm64" or "android-x64")))
            throw new CliException("RuntimeIdentifiers must select android-arm64 and/or android-x64.", "unsupported-target", "validation");
        var keystore = Path.GetFullPath(Value("AndroidSigningKeyStore"), directory);
        var storePassword = PasswordFile(Value("AndroidSigningStorePass"), directory);
        _ = PasswordFile(Value("AndroidSigningKeyPass"), directory);
        if (!File.Exists(keystore) || Value("ApplicationId").Any(char.IsControl))
            throw new CliException("The upload keystore or ApplicationId is invalid.", "invalid-package-metadata", "validation");
        var expected = await ExecuteAsync("keytool", ["-exportcert", "-rfc", "-keystore", keystore,
            "-alias", Value("AndroidSigningKeyAlias"), "-storepass:file", storePassword], directory, "signing-failed", capture: true);
        var output = Path.GetFullPath(commandLine.Get("output") ?? "artifacts/packages", directory);
        var workspace = Path.Combine(directory, "obj", "goo-package", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(workspace);
        try
        {
            var publish = Path.Combine(workspace, "publish");
            await ExecuteAsync("dotnet", ["publish", project, "-f", "net10.0-android", "-c", "Release", "-m:4",
                "-p:AndroidPackageFormats=aab", "-p:AndroidKeyStore=true", "-o", publish], directory, "publish-failed");
            var candidates = Directory.GetFiles(publish, "*.aab", SearchOption.AllDirectories)
                .Where(path => path.EndsWith("-signed.aab", StringComparison.OrdinalIgnoreCase)).ToArray();
            if (candidates.Length != 1)
                throw new CliException("The Android SDK did not create exactly one signed AAB.", "signing-failed", "signing");
            var bundle = candidates[0];
            await ExecuteAsync("jarsigner", ["-verify", bundle], directory, "signing-failed");
            var actual = await ExecuteAsync("keytool", ["-printcert", "-rfc", "-jarfile", bundle], directory,
                "signing-failed", capture: true);
            using var expectedCertificate = X509Certificate2.CreateFromPem(expected);
            using var actualCertificate = X509Certificate2.CreateFromPem(actual);
            if (!actualCertificate.RawData.AsSpan().SequenceEqual(expectedCertificate.RawData)
                || actualCertificate.Subject.Contains("CN=Android Debug", StringComparison.OrdinalIgnoreCase))
                throw new CliException("The AAB certificate does not match the release upload key.", "signing-failed", "signing");
            await ExecuteAsync("java", ["-jar", bundletool, "validate", $"--bundle={bundle}"], directory, "package-failed");
            Directory.CreateDirectory(output);
            var artifact = Path.Combine(output, Path.GetFileName(bundle));
            File.Move(bundle, artifact, true);
            if (commandLine.Has("json"))
                Console.WriteLine(JsonSerializer.Serialize(new { target = "android", signing = "upload-key", artifacts = new[] { artifact } }));
            else
                Console.WriteLine(artifact);
            return 0;
        }
        catch (CryptographicException)
        {
            throw new CliException("The AAB upload certificate could not be read.", "signing-failed", "signing");
        }
        finally
        {
            Directory.Delete(workspace, true);
        }
    }

    private static string PasswordFile(string value, string directory)
    {
        if (!value.StartsWith("file:", StringComparison.Ordinal))
            throw new CliException("AAB signing passwords must use file: references.", "invalid-package-metadata", "validation");
        var path = Path.GetFullPath(value[5..], directory);
        if (!File.Exists(path))
            throw new CliException("A signing password file is missing.", "invalid-package-metadata", "validation");
        return path;
    }
}
