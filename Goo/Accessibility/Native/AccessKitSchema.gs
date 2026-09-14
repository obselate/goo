package Goo

internal class AccessKitSchema {
  shared {
    internal const Window uint8 = 133
    internal const TextRun uint8 = 1
    internal const SelectedItem uint8 = 10
    internal const MultiLineInput uint8 = 31
    internal func Role(value AccessibilityRole) uint8 -> switch value {
      case AccessibilityRole.Auto: uint8(14)
      case AccessibilityRole.None: uint8(14)
      case AccessibilityRole.Generic: uint8(14)
      case AccessibilityRole.Text: uint8(3)
      case AccessibilityRole.Button: uint8(18)
      case AccessibilityRole.TextInput: uint8(17)
      case AccessibilityRole.TextEditor: uint8(31)
      case AccessibilityRole.Image: uint8(4)
      case AccessibilityRole.Checkbox: uint8(15)
      case AccessibilityRole.Radio: uint8(16)
      case AccessibilityRole.Switch: uint8(29)
      case AccessibilityRole.Slider: uint8(113)
      case AccessibilityRole.SpinButton: uint8(114)
      case AccessibilityRole.ScrollBar: uint8(107)
      case AccessibilityRole.ProgressBar: uint8(101)
      case AccessibilityRole.Group: uint8(78)
      case AccessibilityRole.List: uint8(24)
      case AccessibilityRole.ListItem: uint8(7)
      case AccessibilityRole.Menu: uint8(30)
      case AccessibilityRole.MenuItem: uint8(11)
      case AccessibilityRole.TabList: uint8(121)
      case AccessibilityRole.Tab: uint8(120)
      case AccessibilityRole.Dialog: uint8(66)
      case AccessibilityRole.Alert: uint8(44)
      case AccessibilityRole.Heading: uint8(80)
      case AccessibilityRole.Link: uint8(5)
      case AccessibilityRole.Tree: uint8(129)
      case AccessibilityRole.TreeItem: uint8(9)
      case AccessibilityRole.Grid: uint8(76)
      case AccessibilityRole.GridCell: uint8(77)
      case AccessibilityRole.Row: uint8(6)
      case AccessibilityRole.ColumnHeader: uint8(22)
      case AccessibilityRole.RowHeader: uint8(21)
      case AccessibilityRole.ComboBox: uint8(56)
      case AccessibilityRole.SearchBox: uint8(32)
      case AccessibilityRole.Status: uint8(116)
      case AccessibilityRole.Custom: uint8(78)
    }
  }
}
