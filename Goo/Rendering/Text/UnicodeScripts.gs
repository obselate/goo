package Goo

import System
import System.Buffers
import System.Collections.Generic
import System.Text

internal data struct UnicodeScriptRun(Start int32, Length int32, Script uint32) { }

private data struct UnicodeScriptScalar(Start int32, End int32, Value int32, Script uint32) { }

private data struct UnicodeScriptCluster(Start int32, End int32, ScalarStart int32,
  ScalarEnd int32, Script uint32, PairValue int32) { }

private data struct UnicodeScriptPair(Index int32, Value int32) { }

internal sealed class UnicodeTextAnalysisScratchScope {
  internal let GraphemeScalars List[UnicodeGraphemeScalar]
  internal let ScriptStarts List[int32]
  internal let FallbackStarts List[int32]
  internal let GlyphStarts List[int32]
  internal let ScriptScalars List[UnicodeScriptScalar]
  internal let ScriptClusters List[UnicodeScriptCluster]
  internal let ScriptNext List[uint32]
  internal let ScriptPairs List[UnicodeScriptPair]
  internal let ScriptRuns List[UnicodeScriptRun]
  internal let FallbackCandidates List[TypefaceLease]

  internal init() {
    GraphemeScalars = List[UnicodeGraphemeScalar]()
    ScriptStarts = List[int32]()
    FallbackStarts = List[int32]()
    GlyphStarts = List[int32]()
    ScriptScalars = List[UnicodeScriptScalar]()
    ScriptClusters = List[UnicodeScriptCluster]()
    ScriptNext = List[uint32]()
    ScriptPairs = List[UnicodeScriptPair]()
    ScriptRuns = List[UnicodeScriptRun]()
    FallbackCandidates = List[TypefaceLease]()
  }

  internal func BeginGraphemeScalars(required int32) List[UnicodeGraphemeScalar] -> begin(GraphemeScalars, required)

  internal func BeginScriptStarts(required int32) List[int32] -> begin(ScriptStarts, required)

  internal func BeginFallbackStarts(required int32) List[int32] -> begin(FallbackStarts, required)

  internal func BeginGlyphStarts(required int32) List[int32] -> begin(GlyphStarts, required)

  internal func BeginScriptScalars(required int32) List[UnicodeScriptScalar] -> begin(ScriptScalars, required)

  internal func BeginScriptClusters(required int32) List[UnicodeScriptCluster] -> begin(ScriptClusters, required)

  internal func BeginScriptNext(required int32) List[uint32] -> begin(ScriptNext, required)

  internal func BeginScriptPairs(required int32) List[UnicodeScriptPair] -> begin(ScriptPairs, required)

  internal func BeginScriptRuns(required int32) List[UnicodeScriptRun] -> begin(ScriptRuns, required)

  internal func BeginFallbackCandidates() List[TypefaceLease] {
    FallbackCandidates.Clear()
    return FallbackCandidates
  }

  internal func Clear() {
    GraphemeScalars.Clear()
    ScriptStarts.Clear()
    FallbackStarts.Clear()
    GlyphStarts.Clear()
    ScriptScalars.Clear()
    ScriptClusters.Clear()
    ScriptNext.Clear()
    ScriptPairs.Clear()
    ScriptRuns.Clear()
    FallbackCandidates.Clear()
  }

  private func begin[T](values List[T], required int32) List[T] {
    values.Clear()
    if required > values.Capacity {
      values.Capacity = required
    }
    return values
  }
}

internal sealed class UnicodeTextAnalysisScratch {
  private const RetainedCapacity int32 = 4096
  private const RetainedScopeCount int32 = 2
  private let scopes []UnicodeTextAnalysisScratchScope?
  private var active int32

  internal init() {
    scopes = [RetainedScopeCount]UnicodeTextAnalysisScratchScope?
  }

  internal func Rent(required int32) UnicodeTextAnalysisScratchScope {
    if required < 0 { throw ArgumentOutOfRangeException("required") }
    let index = active
    active = active + 1
    if required <= RetainedCapacity && index < RetainedScopeCount {
      var value = scopes[index]
      if value == nil {
        value = UnicodeTextAnalysisScratchScope()
        scopes[index] = value
      }
      return value
    }
    return UnicodeTextAnalysisScratchScope()
  }

  internal func Return(value UnicodeTextAnalysisScratchScope) {
    if active <= 0 { throw InvalidOperationException("Unicode text scratch is not active") }
    value.Clear()
    active = active - 1
  }
}

internal class UnicodeScripts {
  shared {
    internal func Resolve(text string, scratch UnicodeTextAnalysisScratchScope)
    List[UnicodeScriptRun]{
      if text == nil { throw ArgumentNullException("text") }
      let runs = scratch.BeginScriptRuns(text.Length)
      if text.Length == 0 { return runs }
      let graphemeScalars = scratch.BeginGraphemeScalars(text.Length)
      let starts = scratch.BeginScriptStarts(text.Length)
      UnicodeGraphemes.Starts(text, graphemeScalars, starts)
      let scalars = scratch.BeginScriptScalars(text.Length)
      DecodeScalars(text, scalars)
      let clusters = scratch.BeginScriptClusters(starts.Count)
      BuildClusters(text.Length, starts, scalars, clusters)
      let pairs = scratch.BeginScriptPairs(clusters.Count)
      ResolvePairedPunctuation(clusters, scalars, pairs)
      let next = scratch.BeginScriptNext(clusters.Count)
      ResolveContext(clusters, scalars, next)
      return BuildRuns(clusters, runs)
    }

    private func DecodeScalars(text string, scalars List[UnicodeScriptScalar]) {
      var cursor int32 = 0
      while cursor < text.Length {
        let status = Rune.DecodeFromUtf16(text.AsSpan(cursor, text.Length - cursor), out var rune,
          out var consumed)
        if status != OperationStatus.Done {
          throw ArgumentException("Text must contain valid UTF-16.", "text")
        }
        scalars.Add(UnicodeScriptScalar(cursor, cursor + consumed, rune.Value,
          UnicodeScriptsData.Classify(rune.Value)))
        cursor = cursor + consumed
      }
    }

    private func BuildClusters(textLength int32, starts List[int32],
      scalars List[UnicodeScriptScalar], clusters List[UnicodeScriptCluster]) {
        var scalarIndex int32 = 0
        var clusterIndex int32 = 0
        while clusterIndex < starts.Count {
          let start = starts[clusterIndex]
          let end = if clusterIndex + 1 < starts.Count { starts[clusterIndex + 1] }
          else { textLength }
          let scalarStart = scalarIndex
          var script uint32 = 0u
          var inheritedOnly bool = true
          var pairValue int32 = -1
          while scalarIndex < scalars.Count && scalars[scalarIndex].Start < end {
            let scalar = scalars[scalarIndex]
            if script == 0u && !IsImplicit(scalar.Script) { script = scalar.Script }
            if scalar.Script == UnicodeScriptsData.CommonTag { inheritedOnly = false }
            if pairValue < 0 && PairFor(scalar.Value) >= 0 { pairValue = scalar.Value }
            scalarIndex++
          }
          if script == 0u {
            script = if inheritedOnly { UnicodeScriptsData.InheritedTag }
            else { UnicodeScriptsData.CommonTag }
          }
          clusters.Add(UnicodeScriptCluster(start, end, scalarStart, scalarIndex, script, pairValue))
          clusterIndex++
        }
      }

    private func ResolvePairedPunctuation(clusters List[UnicodeScriptCluster],
      scalars List[UnicodeScriptScalar], stack List[UnicodeScriptPair]) {
        var index int32 = 0
        while index < clusters.Count {
          let value = clusters[index].PairValue
          if value >= 0 {
            let partner = PairFor(value)
            if partner >= 0 {
              if IsOpeningPair(value) {
                stack.Add(UnicodeScriptPair(index, value))
              } else {
                var matched int32 = -1
                var cursor = stack.Count - 1
                while cursor >= 0 {
                  if PairFor(stack[cursor].Value) == value {
                    matched = cursor
                    break
                  }
                  cursor--
                }
                if matched >= 0 {
                  let opening = stack[matched].Index
                  ResolvePair(clusters, scalars, opening, index)
                  while stack.Count > matched { stack.RemoveAt(stack.Count - 1) }
                }
              }
            }
          }
          index++
        }
      }

    private func ResolvePair(clusters List[UnicodeScriptCluster],
      scalars List[UnicodeScriptScalar], opening int32, closing int32) {
        let openingScript = clusters[opening].Script
        let closingScript = clusters[closing].Script
        if !IsImplicit(openingScript) && !IsImplicit(closingScript) {
          return
        }
        let candidate = if !IsImplicit(openingScript) { openingScript }
        else if !IsImplicit(closingScript) { closingScript }
        else { FindOuterScript(clusters, opening, closing) }
        if candidate == 0u { return }
        if !CanUseCluster(clusters[opening], scalars, candidate)
          || !CanUseCluster(clusters[closing], scalars, candidate) { return }
        if IsImplicit(openingScript) {
          let value = clusters[opening]
          clusters[opening] = UnicodeScriptCluster(value.Start, value.End, value.ScalarStart,
            value.ScalarEnd, candidate, value.PairValue)
        }
        if IsImplicit(closingScript) {
          let value = clusters[closing]
          clusters[closing] = UnicodeScriptCluster(value.Start, value.End, value.ScalarStart,
            value.ScalarEnd, candidate, value.PairValue)
        }
      }

    private func FindOuterScript(clusters List[UnicodeScriptCluster], opening int32,
      closing int32) uint32{
        var index = opening - 1
        while index >= 0 {
          let script = clusters[index].Script
          if !IsImplicit(script) { return script }
          index--
        }
        index = closing + 1
        while index < clusters.Count {
          let script = clusters[index].Script
          if !IsImplicit(script) { return script }
          index++
        }
        return 0u
      }

    private func ResolveContext(clusters List[UnicodeScriptCluster],
      scalars List[UnicodeScriptScalar], next List[uint32]) {
        var fill int32 = 0
        while fill < clusters.Count {
          next.Add(0u)
          fill++
        }
        var nextScript uint32 = 0u
        var index = clusters.Count - 1
        while index >= 0 {
          next[index] = nextScript
          let script = clusters[index].Script
          if !IsImplicit(script) { nextScript = script }
          index--
        }

        var priorScript uint32 = 0u
        index = 0
        while index < clusters.Count {
          let cluster = clusters[index]
          if IsImplicit(cluster.Script) {
            var resolved uint32 = 0u
            if priorScript != 0u && CanUseCluster(cluster, scalars, priorScript) {
              resolved = priorScript
            } else if next[index] != 0u && CanUseCluster(cluster, scalars, next[index]) {
              resolved = next[index]
            }
            if resolved == 0u {
              resolved = if cluster.Script == UnicodeScriptsData.InheritedTag {
                UnicodeScriptsData.InheritedTag
              } else {
                UnicodeScriptsData.CommonTag
              }
            }
            clusters[index] = UnicodeScriptCluster(cluster.Start, cluster.End,
              cluster.ScalarStart, cluster.ScalarEnd, resolved, cluster.PairValue)
          }
          let resolvedScript = clusters[index].Script
          if !IsImplicit(resolvedScript) { priorScript = resolvedScript }
          index++
        }
      }

    private func CanUseCluster(cluster UnicodeScriptCluster,
      scalars List[UnicodeScriptScalar], script uint32) bool{
        var found = false
        var scalarIndex = cluster.ScalarStart
        while scalarIndex < cluster.ScalarEnd {
          let scalar = scalars[scalarIndex]
          found = true
          if !UnicodeScriptExtensionsData.AllowsAny(scalar.Value)
            && !UnicodeScriptExtensionsData.Contains(scalar.Value, script) {
              return false
            }
          scalarIndex++
        }
        return found
      }

    private func BuildRuns(clusters List[UnicodeScriptCluster],
      runs List[UnicodeScriptRun]) List[UnicodeScriptRun]{
        if clusters.Count == 0 { return runs }
        var start = clusters[0].Start
        var end = clusters[0].End
        var script = clusters[0].Script
        var index int32 = 1
        while index < clusters.Count {
          let cluster = clusters[index]
          if cluster.Script == script && cluster.Start == end {
            end = cluster.End
          } else {
            runs.Add(UnicodeScriptRun(start, end - start, script))
            start = cluster.Start
            end = cluster.End
            script = cluster.Script
          }
          index++
        }
        runs.Add(UnicodeScriptRun(start, end - start, script))
        return runs
      }

    private func IsImplicit(script uint32) bool -> script == 0u || script == UnicodeScriptsData.CommonTag
      || script == UnicodeScriptsData.InheritedTag

    private func IsOpeningPair(value int32) bool -> switch value {
      case 0x28: true
      case 0x5B: true
      case 0x7B: true
      case 0xF3A: true
      case 0xF3C: true
      case 0x169B: true
      case 0x2045: true
      case 0x207D: true
      case 0x208D: true
      case 0x2308: true
      case 0x230A: true
      case 0x2329: true
      case 0x2768: true
      case 0x276A: true
      case 0x276C: true
      case 0x276E: true
      case 0x2770: true
      case 0x2772: true
      case 0x2774: true
      case 0x27C5: true
      case 0x27E6: true
      case 0x27E8: true
      case 0x27EA: true
      case 0x27EC: true
      case 0x27EE: true
      case 0x2983: true
      case 0x2985: true
      case 0x2987: true
      case 0x2989: true
      case 0x298B: true
      case 0x298D: true
      case 0x298F: true
      case 0x2991: true
      case 0x2993: true
      case 0x2995: true
      case 0x2997: true
      case 0x29D8: true
      case 0x29DA: true
      case 0x29FC: true
      case 0x2E22: true
      case 0x2E24: true
      case 0x2E26: true
      case 0x2E28: true
      case 0x2E55: true
      case 0x2E57: true
      case 0x2E59: true
      case 0x2E5B: true
      case 0x3008: true
      case 0x300A: true
      case 0x300C: true
      case 0x300E: true
      case 0x3010: true
      case 0x3014: true
      case 0x3016: true
      case 0x3018: true
      case 0x301A: true
      case 0xFE59: true
      case 0xFE5B: true
      case 0xFE5D: true
      case 0xFF08: true
      case 0xFF3B: true
      case 0xFF5B: true
      case 0xFF5F: true
      case 0xFF62: true
      case _: false
    }

    private func PairFor(value int32) int32 -> switch value {
      case 0x28: 0x29
      case 0x29: 0x28
      case 0x5B: 0x5D
      case 0x5D: 0x5B
      case 0x7B: 0x7D
      case 0x7D: 0x7B
      case 0xF3A: 0xF3B
      case 0xF3B: 0xF3A
      case 0xF3C: 0xF3D
      case 0xF3D: 0xF3C
      case 0x169B: 0x169C
      case 0x169C: 0x169B
      case 0x2045: 0x2046
      case 0x2046: 0x2045
      case 0x207D: 0x207E
      case 0x207E: 0x207D
      case 0x208D: 0x208E
      case 0x208E: 0x208D
      case 0x2308: 0x2309
      case 0x2309: 0x2308
      case 0x230A: 0x230B
      case 0x230B: 0x230A
      case 0x2329: 0x232A
      case 0x232A: 0x2329
      case 0x2768: 0x2769
      case 0x2769: 0x2768
      case 0x276A: 0x276B
      case 0x276B: 0x276A
      case 0x276C: 0x276D
      case 0x276D: 0x276C
      case 0x276E: 0x276F
      case 0x276F: 0x276E
      case 0x2770: 0x2771
      case 0x2771: 0x2770
      case 0x2772: 0x2773
      case 0x2773: 0x2772
      case 0x2774: 0x2775
      case 0x2775: 0x2774
      case 0x27C5: 0x27C6
      case 0x27C6: 0x27C5
      case 0x27E6: 0x27E7
      case 0x27E7: 0x27E6
      case 0x27E8: 0x27E9
      case 0x27E9: 0x27E8
      case 0x27EA: 0x27EB
      case 0x27EB: 0x27EA
      case 0x27EC: 0x27ED
      case 0x27ED: 0x27EC
      case 0x27EE: 0x27EF
      case 0x27EF: 0x27EE
      case 0x2983: 0x2984
      case 0x2984: 0x2983
      case 0x2985: 0x2986
      case 0x2986: 0x2985
      case 0x2987: 0x2988
      case 0x2988: 0x2987
      case 0x2989: 0x298A
      case 0x298A: 0x2989
      case 0x298B: 0x298C
      case 0x298C: 0x298B
      case 0x298D: 0x2990
      case 0x298E: 0x298F
      case 0x298F: 0x298E
      case 0x2990: 0x298D
      case 0x2991: 0x2992
      case 0x2992: 0x2991
      case 0x2993: 0x2994
      case 0x2994: 0x2993
      case 0x2995: 0x2996
      case 0x2996: 0x2995
      case 0x2997: 0x2998
      case 0x2998: 0x2997
      case 0x29D8: 0x29D9
      case 0x29D9: 0x29D8
      case 0x29DA: 0x29DB
      case 0x29DB: 0x29DA
      case 0x29FC: 0x29FD
      case 0x29FD: 0x29FC
      case 0x2E22: 0x2E23
      case 0x2E23: 0x2E22
      case 0x2E24: 0x2E25
      case 0x2E25: 0x2E24
      case 0x2E26: 0x2E27
      case 0x2E27: 0x2E26
      case 0x2E28: 0x2E29
      case 0x2E29: 0x2E28
      case 0x2E55: 0x2E56
      case 0x2E56: 0x2E55
      case 0x2E57: 0x2E58
      case 0x2E58: 0x2E57
      case 0x2E59: 0x2E5A
      case 0x2E5A: 0x2E59
      case 0x2E5B: 0x2E5C
      case 0x2E5C: 0x2E5B
      case 0x3008: 0x3009
      case 0x3009: 0x3008
      case 0x300A: 0x300B
      case 0x300B: 0x300A
      case 0x300C: 0x300D
      case 0x300D: 0x300C
      case 0x300E: 0x300F
      case 0x300F: 0x300E
      case 0x3010: 0x3011
      case 0x3011: 0x3010
      case 0x3014: 0x3015
      case 0x3015: 0x3014
      case 0x3016: 0x3017
      case 0x3017: 0x3016
      case 0x3018: 0x3019
      case 0x3019: 0x3018
      case 0x301A: 0x301B
      case 0x301B: 0x301A
      case 0xFE59: 0xFE5A
      case 0xFE5A: 0xFE59
      case 0xFE5B: 0xFE5C
      case 0xFE5C: 0xFE5B
      case 0xFE5D: 0xFE5E
      case 0xFE5E: 0xFE5D
      case 0xFF08: 0xFF09
      case 0xFF09: 0xFF08
      case 0xFF3B: 0xFF3D
      case 0xFF3D: 0xFF3B
      case 0xFF5B: 0xFF5D
      case 0xFF5D: 0xFF5B
      case 0xFF5F: 0xFF60
      case 0xFF60: 0xFF5F
      case 0xFF62: 0xFF63
      case 0xFF63: 0xFF62
      case _: -1
    }
  }
}
