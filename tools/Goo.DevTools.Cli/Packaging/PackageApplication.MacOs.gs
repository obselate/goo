package Goo.DevTools.Cli

import System.Xml.Linq
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading.Tasks

internal shared partial class PackageApplication {
    private async func PackageMacOsAsync(publish string, workspace string, symbols string, metadata Metadata) string {
        let plist = Path.Combine(workspace, "Info.plist")
        let values = Dictionary[string, string]{
            ["CFBundleIdentifier"] = metadata.Id,
            ["CFBundleExecutable"] = metadata.Executable,
            ["CFBundleName"] = metadata.Name,
            ["CFBundleDisplayName"] = metadata.Name,
            ["CFBundlePackageType"] = "APPL",
            ["CFBundleShortVersionString"] = metadata.Version,
            ["CFBundleVersion"] = metadata.Version,
            ["CFBundleIconFile"] = Path.GetFileName(metadata.Icon),
            ["LSMinimumSystemVersion"] = "14.0"
        }
        let dictionary = XElement(
            XName?("dict")!!,
            values.SelectMany(
                func (pair KeyValuePair[string, string]) IEnumerable[XElement] {
                    return []XElement{XElement(XName?("key")!!, pair.Key), XElement(XName?("string")!!, pair.Value)}
                }
            )
        )
        dictionary.Add(XElement(XName?("key")!!, "NSHighResolutionCapable"), XElement(XName?("true")!!))
        if metadata.UrlSchemes.Length > 0 {
            dictionary.Add(
                XElement(XName?("key")!!, "CFBundleURLTypes"),
                XElement(
                    XName?("array")!!,
                    XElement(
                        XName?("dict")!!,
                        XElement(XName?("key")!!, "CFBundleURLName"),
                        XElement(XName?("string")!!, metadata.Id),
                        XElement(XName?("key")!!, "CFBundleURLSchemes"),
                        XElement(
                            XName?("array")!!,
                            metadata.UrlSchemes.Select(
                                func (scheme string) XElement {
                                    return XElement(XName?("string")!!, scheme)
                                }
                            )
                        ),
                        XElement(XName?("key")!!, "CFBundleTypeRole"),
                        XElement(XName?("string")!!, "Viewer")
                    )
                )
            )
        }
        if metadata.DocumentTypes.Length > 0 {
            dictionary.Add(
                XElement(XName?("key")!!, "CFBundleDocumentTypes"),
                XElement(
                    XName?("array")!!,
                    metadata.DocumentTypes.Select(
                        func (extension string) XElement {
                            return XElement(
                                XName?("dict")!!,
                                XElement(XName?("key")!!, "CFBundleTypeExtensions"),
                                XElement(XName?("array")!!, XElement(XName?("string")!!, extension)),
                                XElement(XName?("key")!!, "CFBundleTypeName"),
                                XElement(XName?("string")!!, extension),
                                XElement(XName?("key")!!, "CFBundleTypeRole"),
                                XElement(XName?("string")!!, "Viewer")
                            )
                        }
                    )
                )
            )
        }
        XDocument(
            XDeclaration("1.0", "UTF-8", nil),
            XDocumentType(
                "plist",
                "-//Apple//DTD PLIST 1.0//EN",
                "http://www.apple.com/DTDs/PropertyList-1.0.dtd",
                nil
            ),
            XElement(XName?("plist")!!, XAttribute(XName?("version")!!, "1.0"), dictionary)
        ).Save(plist)
        let iconDestination = Path.Combine(publish, Path.GetFileName(metadata.Icon))
        if !File.Exists(iconDestination) {
            File.Copy(metadata.Icon, iconDestination)
        }
        let app = Path.Combine(workspace, metadata.Executable + ".app")
        await ExecuteAsync(
            "bash",
            []string{
                Path.Combine(AppContext.BaseDirectory, "Packaging", "stage-macos-arm64.sh"),
                publish,
                app,
                symbols,
                metadata.Executable,
                plist,
                metadata.Version
            },
            workspace,
            "stage-failed"
        )
        let source = Path.Combine(workspace, "dmg")
        Directory.CreateDirectory(source)
        await ExecuteAsync(
            "ditto",
            []string{app, Path.Combine(source, Path.GetFileName(app))},
            workspace,
            "stage-failed"
        )
        Directory.CreateSymbolicLink(Path.Combine(source, "Applications"), "/Applications")
        let artifact = Path.Combine(workspace, "${metadata.Id}-${metadata.Version}-osx-arm64.dmg")
        for attempt in 0 ... 5 {
            try {
                Console.Error.Write(
                    await ExecuteAsync(
                        "hdiutil",
                        []string{
                            "create",
                            "-volname",
                            metadata.Name,
                            "-srcfolder",
                            source,
                            "-format",
                            "UDZO",
                            artifact
                        },
                        workspace,
                        "package-failed",
                        capture: true
                    )
                )
                break
            } catch (exception CliException) when attempt < 4 &&
                (
                exception.Message.Contains("Resource busy", StringComparison.Ordinal) || exception.Message.Contains(
                    "Resource temporarily unavailable",
                    StringComparison.Ordinal
                )
            ) {
                File.Delete(artifact)
                await Task.Delay(1000)
            }
        }
        return artifact
    }
}
