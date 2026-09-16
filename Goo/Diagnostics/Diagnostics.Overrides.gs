package Goo

import System
import System.Collections.Generic
import System.Globalization
import System.Text.Json

internal class DiagnosticOverrideValue {
  internal let Original StyleEntry
  internal var Current StyleEntry

  internal init(original StyleEntry, current StyleEntry) {
    Original = original
    Current = current
  }
}

internal class DiagnosticOverrideNode {
  internal let Values Dictionary[StyleField, DiagnosticOverrideValue]

  internal init() {
    Values = Dictionary[StyleField, DiagnosticOverrideValue]()
  }
}

internal class DiagnosticOverrideStore {
  private let values Dictionary[Node, DiagnosticOverrideNode]

  internal init() {
    values = Dictionary[Node, DiagnosticOverrideNode]()
  }

  internal func State(n Node) DiagnosticOverrideNode? {
    if values.TryGetValue(n, out var state) { return state }
    return nil
  }

  internal func Set(n Node, entry StyleEntry) {
    let state = if values.TryGetValue(n, out var existing) {
      existing
    } else {
      let created = DiagnosticOverrideNode()
      values[n] = created
      created
    }
    if state.Values.TryGetValue(entry.Field, out var prior) {
      prior.Current = entry
    } else {
      state.Values[entry.Field] = DiagnosticOverrideValue(readField(n, entry.Field), entry)
    }
  }

  internal func ClearFields(n Node, fields []StyleField) bool {
    guard let state = State(n) else { return false }
    var changed = false
    for field in fields {
      if !state.Values.TryGetValue(field, out var value) { continue }
      writeDirect(n, value.Original)
      state.Values.Remove(field)
      changed = true
    }
    if state.Values.Count == 0 { values.Remove(n) }
    return changed
  }

  internal func Clear(n Node) bool {
    guard let state = State(n) else { return false }
    for pair in state.Values { writeDirect(n, pair.Value.Original) }
    state.Values.Clear()
    values.Remove(n)
    return true
  }

  internal func Drop(n Node) bool -> values.Remove(n)
}

internal enum DiagnosticOverrideValueKind { Length; Color; Scalar }

internal class DiagnosticOverrideRequest {
  internal let NodeId int64
  internal let Property string
  internal let Value string

  internal init(nodeId int64, property string, value string) {
    NodeId = nodeId
    Property = property
    Value = value
  }
}

internal class DiagnosticOverrideSpec {
  internal let Name string
  internal let Kind DiagnosticOverrideValueKind
  internal let Fields []StyleField

  internal init(name string, kind DiagnosticOverrideValueKind, fields []StyleField) {
    Name = name
    Kind = kind
    Fields = fields
  }
}

internal func applyDebugOverrides(resolver Resolver, n Node) StyleMask {
  guard let store = resolver.DebugOverrides, let state = store.State(n) else {
    return StyleMask{}
  }
  var mask = StyleMask{}
  for pair in state.Values {
    let field = pair.Key
    if !styleFieldApplies(n, field) { continue }
    mask = styleMaskWith(mask, field)
    resolver.FinishDebugTransition(n, field)
    if writeDirectWithInvalidation(n, pair.Value.Current, nil) {
      resolver.RecordDebugResolvedChange(field)
    }
    if inheritable(field) { resolver.PropagateDebugInheritance(n, field) }
  }
  return mask
}

internal func parseDiagnosticOverride(root JsonElement) DiagnosticOverrideRequest {
  let nodeId = diagnosticNodeId(root)
  var rawValue JsonElement
  if root.TryGetProperty("value", out var value) {
    rawValue = value
  } else {
    throw FormatException("Override value is required.")
  }
  let propertyText = diagnosticText(root, "property")
  if propertyText != "" {
    return DiagnosticOverrideRequest(nodeId, propertyText.Trim(), diagnosticRawValue(rawValue))
  }
  if rawValue.ValueKind != JsonValueKind.String {
    throw FormatException("Override property is required when value is not an assignment.")
  }
  let assignment = diagnosticRawValue(rawValue).Trim()
  let separator = assignment.IndexOf('=')
  if separator <= 0 || separator >= assignment.Length - 1 {
    throw FormatException("Override value must use Property = value.")
  }
  let property = assignment.Substring(0, separator).Trim()
  let assignmentValue = assignment.Substring(separator + 1).Trim()
  if property == "" || assignmentValue == "" {
    throw FormatException("Override property and value are required.")
  }
  return DiagnosticOverrideRequest(nodeId, property, assignmentValue)
}

internal func diagnosticOverrideSpec(property string) DiagnosticOverrideSpec {
  let normalized = property.Replace("-", "").Replace("_", "").Trim().ToLowerInvariant()
  switch normalized {
    case "backgroundcolor" { return DiagnosticOverrideSpec("BackgroundColor",
      DiagnosticOverrideValueKind.Color, []StyleField{ StyleField.BackgroundColor }) }
    case "color" { return DiagnosticOverrideSpec("Color",
      DiagnosticOverrideValueKind.Color, []StyleField{ StyleField.Color }) }
    case "opacity" { return DiagnosticOverrideSpec("Opacity",
      DiagnosticOverrideValueKind.Scalar, []StyleField{ StyleField.Opacity }) }
    case "width" { return DiagnosticOverrideSpec("Width",
      DiagnosticOverrideValueKind.Length, []StyleField{ StyleField.Width }) }
    case "height" { return DiagnosticOverrideSpec("Height",
      DiagnosticOverrideValueKind.Length, []StyleField{ StyleField.Height }) }
    case "padding" { return DiagnosticOverrideSpec("Padding",
      DiagnosticOverrideValueKind.Length, []StyleField{
        StyleField.Padding, StyleField.PaddingLeft, StyleField.PaddingTop,
        StyleField.PaddingRight, StyleField.PaddingBottom,
      }) }
    case "margin" { return DiagnosticOverrideSpec("Margin",
      DiagnosticOverrideValueKind.Length, []StyleField{
        StyleField.Margin, StyleField.MarginLeft, StyleField.MarginTop,
        StyleField.MarginRight, StyleField.MarginBottom,
      }) }
    case "gap" { return DiagnosticOverrideSpec("Gap",
      DiagnosticOverrideValueKind.Length, []StyleField{ StyleField.Gap }) }
    case "borderradius" { return DiagnosticOverrideSpec("BorderRadius",
      DiagnosticOverrideValueKind.Length, []StyleField{ StyleField.BorderRadius }) }
    case "fontsize" { return DiagnosticOverrideSpec("FontSize",
      DiagnosticOverrideValueKind.Length, []StyleField{ StyleField.FontSize }) }
    default { throw NotSupportedException("Unsupported runtime override property: " + property) }
  }
}

internal func diagnosticOverrideEntries(spec DiagnosticOverrideSpec, value string) List[StyleEntry] {
  let first = switch spec.Kind {
    case DiagnosticOverrideValueKind.Length: diagnosticLengthEntry(spec.Fields[0], value, spec.Name)
    case DiagnosticOverrideValueKind.Color: diagnosticColorEntry(spec.Fields[0], value, spec.Name)
    case DiagnosticOverrideValueKind.Scalar: diagnosticScalarEntry(spec.Fields[0], value, spec.Name)
    case _: throw NotSupportedException("Unsupported runtime override value kind")
  }
  let result = List[StyleEntry](spec.Fields.Length)
  for field in spec.Fields {
    var entry = first
    entry.Field = field
    result.Add(entry)
  }
  return result
}

private func diagnosticLengthEntry(field StyleField, raw string, property string) StyleEntry {
  let value = raw.Trim()
  if value == "" { throw FormatException(property + " must not be empty.") }
  let lower = value.ToLowerInvariant()
  var unit LengthUnit = LengthUnit.Px
  var numberText = lower
  if lower.EndsWith("px") {
    numberText = lower.Substring(0, lower.Length - 2).Trim()
  } else if lower.EndsWith("%") {
    unit = LengthUnit.Percent
    numberText = lower.Substring(0, lower.Length - 1).Trim()
  } else if lower == "auto" {
    if field != StyleField.Width && field != StyleField.Height {
      throw FormatException(property + " does not support auto.")
    }
    return StyleEntry{ Field: field, A: 0.0F, B: float32(int32(LengthUnit.Auto)) }
  }
  if numberText == "" || !Double.TryParse(numberText, NumberStyles.Float, CultureInfo.InvariantCulture,
    out var parsed) {
      throw FormatException("Invalid " + property + " value: " + raw)
    }
  if Double.IsNaN(parsed) || Double.IsInfinity(parsed) {
    throw FormatException("Invalid " + property + " value: " + raw)
  }
  if parsed < 0.0 && !diagnosticMarginField(field) {
    throw ArgumentOutOfRangeException(property)
  }
  let packed = float32(parsed)
  if Single.IsNaN(packed) || Single.IsInfinity(packed) {
    throw FormatException("Invalid " + property + " value: " + raw)
  }
  if unit == LengthUnit.Percent && parsed > 1000000.0 {
    throw ArgumentOutOfRangeException(property)
  }
  return StyleEntry{ Field: field, A: packed, B: float32(int32(unit)) }
}

private func diagnosticColorEntry(field StyleField, raw string, property string) StyleEntry {
  guard let color = diagnosticColor(raw) else {
    throw FormatException("Invalid " + property + " value: " + raw)
  }
  return StyleEntry{ Field: field, A: color.R, B: color.G, C: color.B, D: color.A }
}

private func diagnosticColor(raw string) Color? {
  let value = raw.Trim()
  if let parsed = Color.TryParse(value) { return parsed }
  let parts = value.Split(',', StringSplitOptions.RemoveEmptyEntries)
  if parts.Length != 3 && parts.Length != 4 { return nil }
  let channels = [4]float32
  var index int32
  while index < parts.Length {
    if !Double.TryParse(parts[index].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture,
      out var parsed) {
        return nil
      }
    if Double.IsNaN(parsed) || Double.IsInfinity(parsed) || parsed < 0.0 || parsed > 1.0 {
      return nil
    }
    channels[index] = float32(parsed)
    index = index + 1
  }
  if parts.Length == 3 { channels[3] = 1.0F }
  return Color.FromNormalized(channels[0], channels[1], channels[2], channels[3])
}

private func diagnosticScalarEntry(field StyleField, raw string, property string) StyleEntry {
  if !Double.TryParse(raw.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
    || Double.IsNaN(parsed) || Double.IsInfinity(parsed) || parsed < 0.0 || parsed > 1.0 {
      throw FormatException("Invalid " + property + " value: " + raw)
    }
  return StyleEntry{ Field: field, A: float32(parsed) }
}

private func diagnosticMarginField(field StyleField) bool -> field == StyleField.Margin
  || field == StyleField.MarginLeft || field == StyleField.MarginTop
  || field == StyleField.MarginRight || field == StyleField.MarginBottom

private func diagnosticNodeId(root JsonElement) int64 {
  if !root.TryGetProperty("nodeId", out var value) {
    if diagnosticText(root, "target") != "" { return 0 }
    throw FormatException("Override nodeId is required.")
  }
  if value.ValueKind == JsonValueKind.Number {
    try { return value.GetInt64() } catch (_ Exception) { }
  }
  if value.ValueKind == JsonValueKind.String {
    let text = value.GetString()
    if let actual = text {
      if Int64.TryParse(actual.Trim(), NumberStyles.Integer,
        CultureInfo.InvariantCulture, out var parsed) {
          return parsed
        }
    }
  }
  throw FormatException("Override nodeId must be an integer.")
}

internal func diagnosticResetNodeId(root JsonElement) int64 -> diagnosticNodeId(root)

private func diagnosticText(root JsonElement, name string) string {
  if !root.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String {
    return ""
  }
  return value.GetString() ?? ""
}

private func diagnosticRawValue(value JsonElement) string {
  if value.ValueKind == JsonValueKind.String { return value.GetString() ?? "" }
  if value.ValueKind == JsonValueKind.Number { return value.GetRawText() }
  return ""
}
