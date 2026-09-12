package Goo

import System
import System.Collections.Generic
import System.IO

internal sealed class FileSystemFontResolver {
  private let gate object = Object()
  private var files []string = []string{}

  public func Find(family string, weight int32, italic bool) string? {
    let requested = normalize(family)
    let aliases = requested == "" || requested == "sansserif" || requested == "sans"
      || requested == "systemui"
    var best string?
    var bestScore int32 = Int32.MinValue
    for file in FontFiles() {
      let fileName = Path.GetFileNameWithoutExtension(file)
      let stem = normalize(fileName)
      var familyScore int32
      if aliases {
        if stem.Contains("dejavusans") || stem.Contains("adwaitasans")
          || stem.Contains("liberationsans") || stem.StartsWith("segoeui")
          || stem.StartsWith("sfpro") || stem.StartsWith("sfns")
          || stem.StartsWith("arial") { familyScore = 50 }
        if OperatingSystem.IsAndroid() {
          if stem == "roboto" || stem == "robotoregular" || stem == "robotobold"
            || stem == "robotoitalic" || stem == "robotobolditalic"
            || stem.StartsWith("roboto[") { familyScore = 80 }
          if stem == "notosans" || stem == "notosansregular" || stem == "notosansbold"
            || stem == "notosansitalic" || stem == "notosansbolditalic" { familyScore = 60 }
        }
      } else if stem.Contains(requested) {
        familyScore = 100
      }
      if familyScore == 0 { continue }
      var score = familyScore
      let bold = stem.Contains("bold") || stem.Contains("semibold")
        || stem == "arialbd" || stem == "arialbi" || stem == "segoeuib"
        || stem == "segoeuibl" || stem == "segoeuisb" || stem == "segoeuiz"
      let slanted = stem.Contains("italic") || stem.Contains("oblique")
        || stem == "ariali" || stem == "arialbi" || stem == "segoeuii"
        || stem == "segoeuili" || stem == "segoeuisli" || stem == "segoeuiz"
      if weight >= 600 { score = score + (if bold { 20 } else { -15 }) }
      else { score = score + (if bold { -10 } else { 10 }) }
      if italic { score = score + (if slanted { 20 } else { -15 }) }
      else { score = score + (if slanted { -10 } else { 10 }) }
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
}

internal class SystemFontResolvers {
  shared {
    private let current FileSystemFontResolver = FileSystemFontResolver()

    internal func Current() FileSystemFontResolver -> current
  }
}
