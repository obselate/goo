package Goo

import System
import System.Collections.Generic
import System.IO

internal sealed class FileSystemFontResolver {
  private let gate object = Object()
  private var files []string = []string{}

  public func Find(family string, weight int32, italic bool) string? {
    let requested = normalize(family)
    let sansAliases = requested == "" || requested == "sansserif" || requested == "sans"
      || requested == "systemui"
    let monoAliases = requested == "monospace" || requested == "mono"
    var best string?
    var bestScore int32 = Int32.MinValue
    for file in FontFiles() {
      let fileName = Path.GetFileNameWithoutExtension(file)
      let stem = normalize(fileName)
      var familyScore int32
      if sansAliases {
        if !stem.Contains("mono") && (stem.Contains("dejavusans") || stem.Contains("adwaitasans")
          || stem.Contains("liberationsans") || stem.StartsWith("segoeui")
          || stem.StartsWith("sfpro") || stem.StartsWith("sfns")
          || stem.StartsWith("arial")) { familyScore = 50 }
        if OperatingSystem.IsAndroid() {
          if stem == "roboto" || stem == "robotoregular" || stem == "robotobold"
            || stem == "robotoitalic" || stem == "robotobolditalic"
            || stem.StartsWith("roboto[") { familyScore = 80 }
          if stem == "notosans" || stem == "notosansregular" || stem == "notosansbold"
            || stem == "notosansitalic" || stem == "notosansbolditalic" { familyScore = 60 }
        }
      } else if monoAliases {
        if (stem.Contains("mono") && !stem.Contains("propo") && !stem.StartsWith("monotype"))
          || stem.StartsWith("consolas") || stem.StartsWith("couriernew")
          || stem.StartsWith("menlo") || stem.StartsWith("monaco")
          || stem.StartsWith("lucidaconsole") || stem.StartsWith("sourcecodepro") {
            familyScore = 50
          }
      } else if stem.Contains(requested) {
        familyScore = 100
      }
      if familyScore == 0 { continue }
      let faceWeight = FontWeight(stem)
      let slanted = stem.Contains("italic") || stem.Contains("oblique")
        || stem == "ariali" || stem == "arialbi" || stem == "segoeuii"
        || stem == "segoeuili" || stem == "segoeuisli" || stem == "segoeuiz"
      let stylePenalty = if italic == slanted { 0 } else { 1000 }
      let score = familyScore * 1000 - Math.Abs(Math.Clamp(weight, 100, 900) - faceWeight)
        - stylePenalty
      var shouldReplace = best == nil || score > bestScore
      if !shouldReplace && score == bestScore {
        if let current = best { shouldReplace = String.CompareOrdinal(file, current) < 0 }
      }
      if shouldReplace {
        best = file
        bestScore = score
      }
    }
    return best
  }

  private func FontFiles() []string {
    lock gate {
      if files.Length != 0 { return files }
      let result = List[string]()
      let profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
      let roots = []string{
        "/usr/share/fonts",
        "/usr/local/share/fonts",
        if profile.Length == 0 { "" } else { Path.Combine(profile, ".fonts") },
        if profile.Length == 0 { "" } else { Path.Combine(profile, ".local", "share", "fonts") },
        Environment.GetFolderPath(Environment.SpecialFolder.Fonts),
        "C:\\Windows\\Fonts",
        "/System/Library/Fonts",
        "/System/Library/Fonts/Supplemental",
        "/Library/Fonts",
        if profile.Length == 0 { "" } else { Path.Combine(profile, "Library", "Fonts") },
        "/system/fonts",
        "/product/fonts",
      }
      for root in roots {
        if root.Length == 0 || !Directory.Exists(root) { continue }
        try {
          for file in Directory.GetFiles(root, "*.*", SearchOption.AllDirectories) {
            let extension = Path.GetExtension(file).ToLowerInvariant()
            if extension == ".ttf" || extension == ".otf" || extension == ".ttc"
              || extension == ".otc" { result.Add(file) }
          }
        } catch (error Exception) { }
      }
      files = result.ToArray()
      return files
    }
  }

  private func normalize(value string) string ->
  value.ToLowerInvariant().Replace(" ", "").Replace("-", "").Replace("_", "")

  private func FontWeight(stem string) int32 {
    if stem.Contains("thin") || stem.Contains("hairline") { return 100 }
    if stem.Contains("extralight") || stem.Contains("ultralight") { return 200 }
    if stem.Contains("light") { return 300 }
    if stem.Contains("black") || stem.Contains("heavy") { return 900 }
    if stem.Contains("extrabold") || stem.Contains("ultrabold") { return 800 }
    if stem.Contains("semibold") || stem.Contains("demibold") || stem == "segoeuisb" {
      return 600
    }
    if stem.Contains("bold") || stem == "arialbd" || stem == "arialbi"
      || stem == "segoeuib" || stem == "segoeuibl" || stem == "segoeuiz" {
        return 700
      }
    if stem.Contains("medium") { return 500 }
    return 400
  }
}

internal class SystemFontResolvers {
  shared {
    private let current FileSystemFontResolver = FileSystemFontResolver()

    internal func Current() FileSystemFontResolver -> current
  }
}
